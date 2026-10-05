import uuid
import hashlib
import secrets
import io
import zipfile
import os
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from datetime import datetime, timezone

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.extension import (
    ExtensionTokenCreate,
    ExtensionTokenOut,
    ExtensionTokenCreatedOut,
    ExtensionJobCreate,
)
from app.models.extension_token import ExtensionToken
from app.models.user import User
from app.services import ingest as ingest_service
from app.services import workspace as workspace_service

router = APIRouter(prefix="/api/v1/extension", tags=["extension"])


def _bearer_token(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    m = __import__("re").match(r"^Bearer\s+(\S+)$", auth_header)
    if not m:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = m.group(1)
    if not token.startswith("jfx_"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format")
    return token


async def _extension_token(request: Request, db: AsyncSession) -> ExtensionToken:
    token = _bearer_token(request)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    result = await db.execute(
        select(ExtensionToken).where(ExtensionToken.token_hash == token_hash)
    )
    tok = result.scalar_one_or_none()
    if not tok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown token")
    return tok


@router.get("/tokens", response_model=list[ExtensionTokenOut])
async def list_tokens(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ExtensionToken).where(ExtensionToken.user_id == uuid.UUID(user["user_id"]))
    )
    return list(result.scalars().all())


@router.post("/tokens", response_model=ExtensionTokenCreatedOut)
async def create_token(
    data: ExtensionTokenCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await workspace_service.get_workspace_for_user(db, uuid.UUID(user["user_id"]))
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    raw_token = f"jfx_{secrets.token_hex(24)}"
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    token_prefix = raw_token[:12]

    token = ExtensionToken(
        user_id=uuid.UUID(user["user_id"]),
        workspace_id=ws.id,
        label=data.label or "",
        token_hash=token_hash,
        token_prefix=token_prefix,
    )
    db.add(token)
    await db.flush()

    return ExtensionTokenCreatedOut(
        id=token.id,
        token=raw_token,
        prefix=token_prefix,
        label=token.label,
    )


@router.delete("/tokens/{token_id}")
async def revoke_token(
    token_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(ExtensionToken)
        .where(ExtensionToken.id == token_id)
        .where(ExtensionToken.user_id == uuid.UUID(user["user_id"]))
    )
    await db.flush()
    return {"ok": True}


@router.get("/profile")
async def get_profile_via_extension(request: Request, db: AsyncSession = Depends(get_db)):
    """Profile fields used by the extension's autofill feature, authenticated the same
    way as /jobs (a personal jfx_ token), not the user's JWT."""
    tok = await _extension_token(request, db)

    result = await db.execute(select(User).where(User.id == tok.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "location": user.location,
        "linkedin_url": user.linkedin_url,
        "portfolio_url": user.portfolio_url,
        "current_title": user.current_title,
        "current_company": user.current_company,
    }


@router.post("/jobs")
async def submit_job_via_extension(request: Request, db: AsyncSession = Depends(get_db)):
    tok = await _extension_token(request, db)

    body = await request.json()
    try:
        from app.schemas.extension import ExtensionJobCreate
        data = ExtensionJobCreate(**body)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        result = await ingest_service.ingest_job(
            db,
            tok.workspace_id,
            company=data.company,
            title=data.title,
            url=data.url,
            description=data.description or "",
            location=data.location,
            apply_url=data.apply_url,
            source_hint=data.source,
            actor="extension",
        )
    except ingest_service.NoBoardError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No board found")

    tok.last_used_at = datetime.now(timezone.utc)
    await db.flush()

    # `duplicate` is additive: older extension builds ignore it and treat the response as a save.
    return {"ok": True, "id": str(result.job_id), "duplicate": result.duplicate}


@router.get("/download")
async def download_extension():
    ext_dir = "/extension"
    if not os.path.isdir(ext_dir):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extension not found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(ext_dir):
            for file in files:
                filepath = os.path.join(root, file)
                arcname = os.path.relpath(filepath, ext_dir)
                zf.write(filepath, arcname)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=jobforge-extension.zip"},
    )
