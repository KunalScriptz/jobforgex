import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.job import (
    JobCreate,
    JobUpdate,
    JobOut,
    JobDetailOut,
    JobSearchParams,
    BulkStatusUpdate,
    BulkDelete,
    JobArtifactCreate,
    JobArtifactOut,
)
from app.models.job import JobStatus, ArtifactKind
from app.services import jobs as jobs_service
from app.services import workspace as workspace_service
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


async def get_workspace_id(user: dict, db: AsyncSession) -> uuid.UUID:
    ws = await workspace_service.get_workspace_for_user(db, uuid.UUID(user["user_id"]))
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return ws.id


@router.get("/", response_model=list[JobOut])
async def list_jobs(
    board_id: uuid.UUID | None = None,
    search: str | None = None,
    status: str | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    status_enum = JobStatus(status) if status else None
    return await jobs_service.list_jobs(db, ws_id, board_id, search, status_enum)


@router.get("/{job_id}", response_model=JobDetailOut)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await jobs_service.get_job_detail(db, job_id)


@router.post("/", response_model=JobOut)
async def create_job(
    data: JobCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    return await jobs_service.create_job(
        db,
        workspace_id=ws_id,
        board_id=data.board_id,
        company=data.company,
        title=data.title,
        description=data.description or "",
        url=data.url,
        notes=data.notes,
        location=data.location,
        status=data.status,
        date_applied=str(data.date_applied) if data.date_applied else None,
        resume_score=data.resume_score,
    )


@router.put("/{job_id}")
async def update_job(
    job_id: uuid.UUID,
    data: JobUpdate,
    db: AsyncSession = Depends(get_db),
):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    await jobs_service.update_job(db, job_id, **updates)
    return {"ok": True}


@router.delete("/{job_id}")
async def delete_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    await jobs_service.delete_job(db, job_id)
    return {"ok": True}


@router.post("/bulk-status")
async def bulk_update_status(
    data: BulkStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    await jobs_service.bulk_update_status(db, data.ids, data.status)
    return {"ok": True}


@router.post("/bulk-delete")
async def bulk_delete_jobs(
    data: BulkDelete,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    count = await jobs_service.bulk_delete_jobs(db, ws_id, data.ids)
    return {"ok": True, "count": count}


@router.get("/artifacts/{job_id}", response_model=list[JobArtifactOut])
async def list_artifacts(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    detail = await jobs_service.get_job_detail(db, job_id)
    return detail["artifacts"]


@router.post("/artifacts", response_model=JobArtifactOut)
async def create_artifact(
    data: JobArtifactCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    return await jobs_service.create_artifact(
        db,
        workspace_id=ws_id,
        job_id=data.job_id,
        kind=ArtifactKind(data.kind.value),
        filename=data.filename,
        latex_source=data.latex_source,
    )


@router.delete("/artifacts/{artifact_id}")
async def delete_artifact(
    artifact_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    await jobs_service.delete_artifact(db, artifact_id)
    return {"ok": True}


class ArtifactUpdateRequest(BaseModel):
    latex_source: str


@router.patch("/artifacts/{artifact_id}")
async def update_artifact(
    artifact_id: uuid.UUID,
    data: ArtifactUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        art = await jobs_service.update_artifact_source(db, artifact_id, data.latex_source)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if not art:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    return {"ok": True}
