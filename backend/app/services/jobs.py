import uuid
from datetime import date as dt_date, datetime, timezone
from sqlalchemy import Integer, case, cast, select, delete, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import Job, JobArtifact, JobEvent, JobStatus, ArtifactKind
from app.models.board import Board
from app.services import job_state, job_url, workspace_settings


class NotFoundError(LookupError):
    """A row doesn't exist *in the caller's workspace*.

    Cross-tenant ids are deliberately indistinguishable from missing ones, so routers
    map this to a plain 404 and never reveal that the row exists elsewhere.
    """


class DuplicateJobError(Exception):
    """The workspace already has a job with this URL. Carries the existing job's id."""

    def __init__(self, existing_id: uuid.UUID):
        super().__init__("You already saved this job")
        self.existing_id = existing_id


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


def card_query(workspace_id: uuid.UUID):
    """SELECT of just the columns a job card needs (see schemas.job.JobCardOut)."""
    score = Job.base_fit_score["score"].astext
    fit = case((score.op("~")(r"^[0-9]{1,3}$"), cast(score, Integer)), else_=None).label("fit")
    return select(
        Job.id, Job.board_id, Job.company, Job.company_domain, Job.title, Job.url, Job.location,
        Job.status, Job.source, Job.date_applied, Job.resume_score, fit,
        Job.tailored_at, Job.applied_at, Job.last_reply_at, Job.interview_at, Job.follow_up_at,
        Job.created_at, Job.updated_at,
    ).where(Job.workspace_id == workspace_id)


async def list_cards(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    board_id: uuid.UUID | None = None,
    search: str | None = None,
    statuses: list[str] | None = None,
    source: str | None = None,
    min_fit: int | None = None,
    location: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Slim, filterable job list plus the total matching count (before limit/offset)."""
    q = card_query(workspace_id)
    if board_id:
        q = q.where(Job.board_id == board_id)
    if statuses:
        q = q.where(Job.status.in_(statuses))
    if source:
        q = q.where(Job.source == source)
    if location:
        q = q.where(Job.location.ilike(f"%{location}%"))
    if min_fit is not None:
        score = Job.base_fit_score["score"].astext
        q = q.where(score.op("~")(r"^[0-9]{1,3}$"), cast(score, Integer) >= min_fit)
    if search:
        s = f"%{search.replace(',', ' ')}%"
        q = q.where(
            Job.company.ilike(s) | Job.title.ilike(s) | Job.notes.ilike(s)
            | Job.location.ilike(s) | Job.description.ilike(s)
        )
    total = (await db.execute(select(func.count()).select_from(q.order_by(None).subquery()))).scalar_one()
    rows = (
        await db.execute(q.order_by(Job.created_at.desc(), Job.id).limit(limit).offset(offset))
    ).mappings().all()
    return [dict(r) for r in rows], total


async def list_job_events(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    job_id: uuid.UUID | None = None,
    limit: int = 100,
) -> list[JobEvent]:
    q = select(JobEvent).where(JobEvent.workspace_id == workspace_id)
    if job_id:
        q = q.where(JobEvent.job_id == job_id)
    q = q.order_by(JobEvent.occurred_at.desc(), JobEvent.id).limit(limit)
    return list((await db.execute(q)).scalars().all())


async def set_follow_up(
    db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID, day: dt_date | None
) -> Job:
    job = await get_job(db, workspace_id, job_id)
    if job is None:
        raise NotFoundError("Job not found")
    job.follow_up_at = day
    job_state.record_event(
        db, job, "follow_up_set", actor="user",
        meta={"follow_up_at": day.isoformat() if day else None},
    )
    await db.flush()
    return job


async def get_job_detail(db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID) -> dict:
    job = await get_job(db, workspace_id, job_id)
    if job is None:
        raise NotFoundError("Job not found")

    art_result = await db.execute(
        select(JobArtifact).where(JobArtifact.job_id == job_id).order_by(JobArtifact.created_at)
    )
    artifacts = list(art_result.scalars().all())

    return {"job": job, "artifacts": artifacts, "costs": []}


async def _existing_id_for_hash(
    db: AsyncSession, workspace_id: uuid.UUID, url_hash: str, exclude: uuid.UUID | None = None
) -> uuid.UUID | None:
    q = select(Job.id).where(Job.workspace_id == workspace_id, Job.url_hash == url_hash)
    if exclude is not None:
        q = q.where(Job.id != exclude)
    return (await db.execute(q.limit(1))).scalar_one_or_none()


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
    *,
    actor: str = "user",
    source_hint: str | None = None,
    apply_url: str | None = None,
) -> Job:
    """Create a job. Raises NotFoundError (foreign board) or DuplicateJobError (same URL)."""
    await _require_board(db, workspace_id, board_id)

    url_hash = job_url.url_hash(url)
    if url_hash and (existing := await _existing_id_for_hash(db, workspace_id, url_hash)):
        raise DuplicateJobError(existing)

    source = job_url.detect_source(url, source_hint)
    job = Job(
        workspace_id=workspace_id,
        board_id=board_id,
        company=company,
        company_domain=company_domain,
        title=title,
        description=description,
        url=url,
        apply_url=apply_url,
        notes=notes,
        location=location,
        status=JobStatus.WISHLIST.value,
        resume_score=resume_score,
        source=source,
        url_hash=url_hash,
        content_hash=job_url.content_hash(company, title, location),
    )
    try:
        # A savepoint, so losing a race against the unique index leaves the session usable.
        async with db.begin_nested():
            db.add(job)
            await db.flush()
    except IntegrityError:
        existing = url_hash and await _existing_id_for_hash(db, workspace_id, url_hash)
        if not existing:
            raise
        raise DuplicateJobError(existing)

    job_state.record_event(db, job, "created", actor=actor, to_status=JobStatus.WISHLIST.value, meta={"source": source})

    wanted = job_state.status_value(status)
    days = None
    if wanted != JobStatus.WISHLIST.value:
        days = await workspace_settings.follow_up_days(db, workspace_id)
        await job_state.change_status(db, job, wanted, actor=actor, follow_up_days=days)
    if date_applied:
        days = days if days is not None else await workspace_settings.follow_up_days(db, workspace_id)
        job_state.set_date_applied(job, dt_date.fromisoformat(date_applied), follow_up_days=days)
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

    new_status = kwargs.pop("status", None)
    new_date_applied = kwargs.pop("date_applied", None)

    # Check for a URL clash *before* touching the job: any query below would autoflush pending
    # changes, and the unique index would reject them mid-request.
    new_url_hash = None
    if kwargs.get("url") is not None:
        new_url_hash = job_url.url_hash(kwargs["url"])
        if new_url_hash and (clash := await _existing_id_for_hash(db, workspace_id, new_url_hash, exclude=job.id)):
            raise DuplicateJobError(clash)

    for key, value in kwargs.items():
        if value is not None:
            setattr(job, key, value)

    if kwargs.get("url") is not None:
        job.url_hash = new_url_hash
        job.source = job_url.detect_source(job.url)
    if any(kwargs.get(k) is not None for k in ("company", "title", "location")):
        job.content_hash = job_url.content_hash(job.company, job.title, job.location)

    days = None
    if new_status is not None:
        days = await workspace_settings.follow_up_days(db, workspace_id)
        await job_state.change_status(db, job, new_status, actor="user", follow_up_days=days)
    if new_date_applied is not None:
        if isinstance(new_date_applied, str):
            new_date_applied = dt_date.fromisoformat(new_date_applied)
        days = days if days is not None else await workspace_settings.follow_up_days(db, workspace_id)
        job_state.set_date_applied(job, new_date_applied, follow_up_days=days)
    await db.flush()


async def delete_job(db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID) -> None:
    # Idempotent: deleting something that isn't there (or isn't yours) is a quiet no-op.
    await db.execute(delete(Job).where(Job.id == job_id, Job.workspace_id == workspace_id))
    await db.flush()


async def bulk_update_status(
    db: AsyncSession, workspace_id: uuid.UUID, ids: list[uuid.UUID], status: JobStatus
) -> int:
    """Move many jobs; each goes through job_state so timestamps and events stay consistent.
    Ids outside the caller's workspace are silently ignored."""
    jobs = (
        await db.execute(select(Job).where(Job.id.in_(ids), Job.workspace_id == workspace_id))
    ).scalars().all()
    days = await workspace_settings.follow_up_days(db, workspace_id)
    moved = 0
    for job in jobs:
        if await job_state.change_status(db, job, status, actor="user", follow_up_days=days):
            moved += 1
    await db.flush()
    return moved


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
    job = await get_job(db, workspace_id, job_id)
    if job is None:
        raise NotFoundError("Job not found")

    if str(getattr(kind, "value", kind)) == ArtifactKind.TAILORED_RESUME.value and job.tailored_at is None:
        job.tailored_at = datetime.now(timezone.utc)
        job_state.record_event(db, job, "tailored", actor="user", at=job.tailored_at)

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
