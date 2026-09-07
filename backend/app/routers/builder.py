import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.ai import BuilderSeedRequest, BuilderSaveRequest, BuilderCore, BuilderOut
from app.models.job import Job
from app.services import builder as builder_service
from app.services import workspace as workspace_service

router = APIRouter(prefix="/api/v1/builder", tags=["builder"])


async def get_workspace_id(user: dict, db: AsyncSession) -> uuid.UUID:
    ws = await workspace_service.get_workspace_for_user(db, uuid.UUID(user["user_id"]))
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return ws.id


async def _ensure_job(db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID) -> None:
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.workspace_id == workspace_id).limit(1)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")


@router.post("/seed", response_model=BuilderOut)
async def seed_builder(
    data: BuilderSeedRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    job_id = uuid.UUID(data.job_id)
    await _ensure_job(db, ws_id, job_id)
    builder = await builder_service.seed_builder(db, ws_id, job_id)
    return BuilderOut(
        content=builder.content,
        latex_source=builder.latex_source,
        job_match=builder.job_match,
        score=builder.score,
        suggestions=builder.suggestions,
    )


@router.put("/{job_id}")
async def save_builder(
    job_id: uuid.UUID,
    data: BuilderSaveRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    await _ensure_job(db, ws_id, job_id)
    await builder_service.save_builder(db, ws_id, job_id, data.content)
    return {"ok": True}


@router.post("/{job_id}/undo", response_model=BuilderCore)
async def undo_builder(
    job_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    await _ensure_job(db, ws_id, job_id)
    content, latex_source = await builder_service.undo_builder(db, ws_id, job_id)
    return BuilderCore(content=content, latex_source=latex_source)


@router.post("/{job_id}/suggestions/{suggestion_id}/apply", response_model=BuilderCore)
async def apply_suggestion(
    job_id: uuid.UUID,
    suggestion_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    await _ensure_job(db, ws_id, job_id)
    try:
        builder = await builder_service.apply_suggestion(db, ws_id, job_id, suggestion_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return BuilderCore(content=builder.content, latex_source=builder.latex_source)


@router.post("/{job_id}/suggestions/{suggestion_id}/ignore")
async def ignore_suggestion(
    job_id: uuid.UUID,
    suggestion_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    await _ensure_job(db, ws_id, job_id)
    await builder_service.ignore_suggestion(db, ws_id, job_id, suggestion_id)
    return {"ok": True}


@router.post("/{job_id}/save-as-base")
async def save_as_base(
    job_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    await _ensure_job(db, ws_id, job_id)
    await builder_service.save_as_base(db, ws_id, job_id)
    return {"ok": True}
