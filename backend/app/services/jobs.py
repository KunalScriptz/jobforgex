import uuid
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import Job, JobArtifact, JobStatus, ArtifactKind
from app.models.board import Board


class NotFoundError(LookupError):
    """A row doesn't exist *in the caller's workspace*.

    Cross-tenant ids are deliberately indistinguishable from missing ones, so routers
    map this to a plain 404 and never reveal that the row exists elsewhere.
    """


async def get_job(db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID) -> Job | None:
    result = await db.execute(select(Job).where(Job.id == job_id, Job.workspace_id == workspace_id))
    return result.scalar_one_or_none()


async def _require_board(db: AsyncSession, workspace_id: uuid.UUID, board_id: uuid.UUID) -> None:
    result = await db.execute(
        select(Board.id).where(Board.id == board_id, Board.workspace_id == workspace_id)
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("Board not found")


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


async def get_job_detail(db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID) -> dict:
    job = await get_job(db, workspace_id, job_id)
    if job is None:
        raise NotFoundError("Job not found")

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
    company_domain: str | None = None,
) -> Job:
    from datetime import date as dt_date

    await _require_board(db, workspace_id, board_id)

    job = Job(
        workspace_id=workspace_id,
        board_id=board_id,
        company=company,
        company_domain=company_domain,
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
    workspace_id: uuid.UUID,
    job_id: uuid.UUID,
    **kwargs,
) -> None:
    job = await get_job(db, workspace_id, job_id)
    if not job:
        raise NotFoundError("Job not found")

    # Moving a job to another board must stay inside the caller's workspace.
    if kwargs.get("board_id") is not None:
        await _require_board(db, workspace_id, kwargs["board_id"])

    from datetime import date as dt_date

    for key, value in kwargs.items():
        if value is not None:
            if key == "date_applied" and isinstance(value, str):
                value = dt_date.fromisoformat(value)
            setattr(job, key, value)
    await db.flush()


async def delete_job(db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID) -> None:
    # Idempotent: deleting something that isn't there (or isn't yours) is a quiet no-op.
    await db.execute(delete(Job).where(Job.id == job_id, Job.workspace_id == workspace_id))
    await db.flush()


async def bulk_update_status(
    db: AsyncSession, workspace_id: uuid.UUID, ids: list[uuid.UUID], status: JobStatus
) -> int:
    from sqlalchemy import update
    result = await db.execute(
        update(Job)
        .where(Job.id.in_(ids), Job.workspace_id == workspace_id)
        .values(status=status)
    )
    await db.flush()
    return result.rowcount


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
    if await get_job(db, workspace_id, job_id) is None:
        raise NotFoundError("Job not found")

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


async def get_artifact(
    db: AsyncSession, workspace_id: uuid.UUID, artifact_id: uuid.UUID
) -> JobArtifact | None:
    result = await db.execute(
        select(JobArtifact).where(
            JobArtifact.id == artifact_id, JobArtifact.workspace_id == workspace_id
        )
    )
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


async def delete_artifact(db: AsyncSession, workspace_id: uuid.UUID, artifact_id: uuid.UUID) -> None:
    await db.execute(
        delete(JobArtifact).where(
            JobArtifact.id == artifact_id, JobArtifact.workspace_id == workspace_id
        )
    )
    await db.flush()


async def update_artifact_source(
    db: AsyncSession, workspace_id: uuid.UUID, artifact_id: uuid.UUID, latex_source: str
) -> JobArtifact | None:
    import re

    art = await get_artifact(db, workspace_id, artifact_id)
    if art:
        errors = []
        for tag in ["itemize", "document", "center"]:
            opens = len(re.findall(rf"\\begin\{{{tag}\}}", latex_source))
            closes = len(re.findall(rf"\\end\{{{tag}\}}", latex_source))
            if opens != closes:
                errors.append(f"\\begin{{{tag}}} ({opens}) != \\end{{{tag}}} ({closes})")
        for pair in [("resumeSubHeadingListStart", "resumeSubHeadingListEnd"), ("resumeItemListStart", "resumeItemListEnd")]:
            opens = latex_source.count(f"\\{pair[0]}")
            closes = latex_source.count(f"\\{pair[1]}")
            if opens != closes:
                errors.append(f"\\{pair[0]} ({opens}) != \\{pair[1]} ({closes})")
        if errors:
            raise ValueError(f"Unbalanced LaTeX tags: {'; '.join(errors)}")

        art.latex_source = latex_source
        art.pdf_storage_path = ""
        art.compile_error = None
        await db.flush()
    return art
