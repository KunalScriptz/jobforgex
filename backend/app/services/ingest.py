"""Bring an externally discovered job (browser extension today; discovery adapters later) into a
workspace without creating duplicates.

De-duplication rests on the unique `(workspace_id, url_hash)` index plus the pre-check in
`jobs.create_job`, so two saves of the same posting race safely: exactly one row wins and the
other caller is told `duplicate=True` with the winner's id.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.board import Board
from app.models.job import Job
from app.services import jobs as jobs_service


class NoBoardError(LookupError):
    """The workspace has no board to put the job on."""


@dataclass(frozen=True)
class IngestResult:
    job_id: uuid.UUID
    duplicate: bool


async def default_board_id(db: AsyncSession, workspace_id: uuid.UUID) -> uuid.UUID:
    board_id = (
        await db.execute(
            select(Board.id).where(Board.workspace_id == workspace_id).order_by(Board.created_at).limit(1)
        )
    ).scalar_one_or_none()
    if board_id is None:
        raise NoBoardError("No board found")
    return board_id


async def ingest_job(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    company: str,
    title: str,
    url: str | None = None,
    description: str = "",
    location: str | None = None,
    apply_url: str | None = None,
    source_hint: str | None = None,
    board_id: uuid.UUID | None = None,
    actor: str = "extension",
) -> IngestResult:
    """Save a discovered job as 'wishlist' (shown as Saved). Idempotent per URL."""
    board_id = board_id or await default_board_id(db, workspace_id)
    try:
        job: Job = await jobs_service.create_job(
            db,
            workspace_id,
            board_id,
            company=company,
            title=title,
            description=description or "",
            url=url,
            location=location,
            apply_url=apply_url,
            actor=actor,
            source_hint=source_hint,
        )
    except jobs_service.DuplicateJobError as dup:
        return IngestResult(job_id=dup.existing_id, duplicate=True)
    return IngestResult(job_id=job.id, duplicate=False)
