import uuid
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import Job, JobArtifact, JobStatus, ArtifactKind
from app.models.board import Board


async def list_jobs(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    board_id: uuid.UUID | None = None,
    search: str | None = None,
    status: JobStatus | None = None,
) -> list[Job]:
    q = select(Job).where(Job.workspace_id == workspace_id)
    if board_id:
        q = q.where(Job.board_id == board_id)
    if status:
        q = q.where(Job.status == status)
    if search:
        s = search.replace(",", " ")
        q = q.where(
            Job.company.ilike(f"%{s}%")
            | Job.title.ilike(f"%{s}%")
            | Job.notes.ilike(f"%{s}%")
            | Job.location.ilike(f"%{s}%")
        )
    q = q.order_by(Job.created_at.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_job_detail(db: AsyncSession, job_id: uuid.UUID) -> dict:
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()

    art_result = await db.execute(
        select(JobArtifact).where(JobArtifact.job_id == job_id).order_by(JobArtifact.created_at)
    )
    artifacts = list(art_result.scalars().all())

    return {"job": job, "artifacts": artifacts, "costs": []}


async def create_job(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    board_id: uuid.UUID,
    company: str,
    title: str,
    description: str = "",
    url: str | None = None,
    notes: str | None = None,
    location: str | None = None,
    status: JobStatus = JobStatus.WISHLIST,
    date_applied: str | None = None,
    resume_score: int | None = None,
) -> Job:
    from datetime import date as dt_date

    job = Job(
        workspace_id=workspace_id,
        board_id=board_id,
        company=company,
        title=title,
        description=description,
        url=url,
        notes=notes,
        location=location,
        status=status,
        date_applied=dt_date.fromisoformat(date_applied) if date_applied else None,
        resume_score=resume_score,
    )
    db.add(job)
    await db.flush()
    return job


async def update_job(
    db: AsyncSession,
    job_id: uuid.UUID,
    **kwargs,
) -> None:
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise ValueError("Job not found")
    
    from datetime import date as dt_date
    
    for key, value in kwargs.items():
        if value is not None:
            if key == "date_applied" and isinstance(value, str):
                value = dt_date.fromisoformat(value)
            setattr(job, key, value)
    await db.flush()


async def delete_job(db: AsyncSession, job_id: uuid.UUID) -> None:
    await db.execute(delete(Job).where(Job.id == job_id))
    await db.flush()


async def bulk_update_status(db: AsyncSession, ids: list[uuid.UUID], status: JobStatus) -> None:
    from sqlalchemy import update
    await db.execute(update(Job).where(Job.id.in_(ids)).values(status=status))
    await db.flush()


async def bulk_delete_jobs(db: AsyncSession, workspace_id: uuid.UUID, ids: list[uuid.UUID]) -> int:
    result = await db.execute(
        delete(Job).where(Job.id.in_(ids)).where(Job.workspace_id == workspace_id)
    )
    await db.flush()
    return result.rowcount


async def create_artifact(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    job_id: uuid.UUID,
    kind: ArtifactKind,
    filename: str,
    latex_source: str = "",
) -> JobArtifact:
    art = JobArtifact(
        workspace_id=workspace_id,
        job_id=job_id,
        kind=kind,
        filename=filename,
        latex_source=latex_source,
    )
    db.add(art)
    await db.flush()
    return art


async def get_artifact(db: AsyncSession, artifact_id: uuid.UUID) -> JobArtifact | None:
    result = await db.execute(select(JobArtifact).where(JobArtifact.id == artifact_id))
    return result.scalar_one_or_none()


async def update_artifact_pdf_path(
    db: AsyncSession, artifact_id: uuid.UUID, pdf_storage_path: str, compile_error: str | None = None
) -> None:
    result = await db.execute(select(JobArtifact).where(JobArtifact.id == artifact_id))
    art = result.scalar_one_or_none()
    if art:
        art.pdf_storage_path = pdf_storage_path
        art.compile_error = compile_error
        await db.flush()


async def delete_artifact(db: AsyncSession, artifact_id: uuid.UUID) -> None:
    await db.execute(delete(JobArtifact).where(JobArtifact.id == artifact_id))
    await db.flush()


async def update_artifact_source(
    db: AsyncSession, artifact_id: uuid.UUID, latex_source: str
) -> JobArtifact | None:
    result = await db.execute(select(JobArtifact).where(JobArtifact.id == artifact_id))
    art = result.scalar_one_or_none()
    if art:
        art.latex_source = latex_source
        art.pdf_storage_path = ""
        art.compile_error = None
        await db.flush()
    return art
