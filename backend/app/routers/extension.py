import uuid
import hashlib
import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Request
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
from app.models.board import Board
from app.models.job import Job, JobStatus
from app.services import workspace as workspace_service

router = APIRouter(prefix="/api/v1/extension", tags=["extension"])


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


@router.post("/jobs")
async def submit_job_via_extension(request: Request, db: AsyncSession = Depends(get_db)):
    auth_header = request.headers.get("authorization", "")
    m = __import__("re").match(r"^Bearer\s+(\S+)$", auth_header)
    if not m:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = m.group(1)
    if not token.startswith("jfx_"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format")

    body = await request.json()
    try:
        from app.schemas.extension import ExtensionJobCreate
        data = ExtensionJobCreate(**body)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    import hashlib
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    result = await db.execute(
        select(ExtensionToken).where(ExtensionToken.token_hash == token_hash)
    )
    tok = result.scalar_one_or_none()
    if not tok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown token")

    board_result = await db.execute(
        select(Board)
        .where(Board.workspace_id == tok.workspace_id)
        .order_by(Board.created_at)
        .limit(1)
    )
    board = board_result.scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No board found")

    job = Job(
        workspace_id=tok.workspace_id,
        board_id=board.id,
        company=data.company,
        title=data.title,
        url=data.url,
        description=data.description or "",
        location=data.location,
        status=JobStatus.WISHLIST,
    )
    db.add(job)
    await db.flush()

    tok.last_used_at = datetime.now(timezone.utc)
    await db.flush()

    return {"ok": True, "id": str(job.id)}
