"""The single choke point for changing a job's status.

Everything that moves a card (the Tracker drag, the edit dialog, bulk moves, the extension, and
later the pipeline and Gmail sync) goes through `change_status`, so the lifecycle timestamps, the
follow-up date and the audit event can never drift apart from the status itself.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import Job, JobEvent, JobStatus
from app.services import workspace_settings

# The forward ladder. `rejected` sits outside it: it can follow any live status.
LADDER: tuple[str, ...] = (
    JobStatus.WISHLIST.value,
    JobStatus.APPLIED.value,
    JobStatus.ACKNOWLEDGED.value,
    JobStatus.SCREENING.value,
    JobStatus.INTERVIEW.value,
    JobStatus.OFFER.value,
    JobStatus.NEGOTIATING.value,
)
RANK = {status: i for i, status in enumerate(LADDER)}

# The employer has answered. (A rejection counts too, unless the card was merely archived from
# the saved column; see `_is_reply`.)
REPLY_STATUSES = frozenset({"acknowledged", "screening", "interview", "offer", "negotiating"})
# Statuses where "nudge them if you hear nothing" makes sense.
FOLLOW_UP_STATUSES = frozenset({"applied", "acknowledged", "screening", "interview"})
LIVE_STATUSES = frozenset(LADDER[1:])  # applied .. negotiating
ALL_STATUSES = frozenset(s.value for s in JobStatus)

# Actors that act on their own. They may only move a job forward, never touch a saved or closed
# card, and never decide that a negotiation has started: a person owns those calls.
AUTOMATED_ACTORS = frozenset({"gmail", "pipeline", "discovery"})
ACTORS = frozenset({"user", "extension", "system"}) | AUTOMATED_ACTORS


class TransitionNotAllowed(ValueError):
    """An automated actor tried a move it isn't permitted to make."""


def status_value(status: JobStatus | str) -> str:
    value = status.value if isinstance(status, JobStatus) else str(status)
    if value not in ALL_STATUSES:
        raise ValueError(f"Unknown status '{value}'")
    return value


def can_transition(actor: str, current: JobStatus | str, new: JobStatus | str) -> bool:
    cur, nxt = status_value(current), status_value(new)
    if actor not in AUTOMATED_ACTORS:
        return True  # people may move cards anywhere, including backwards
    if cur == nxt or nxt == JobStatus.NEGOTIATING.value:
        return False
    if cur in (JobStatus.WISHLIST.value, JobStatus.REJECTED.value):
        return False
    if nxt == JobStatus.REJECTED.value:
        return True
    return RANK[nxt] > RANK[cur]


def _is_reply(old: str, new: str) -> bool:
    if new in REPLY_STATUSES:
        return True
    # Dragging a saved card straight to Rejected is housekeeping, not an employer reply.
    return new == JobStatus.REJECTED.value and old != JobStatus.WISHLIST.value


def record_event(
    db: AsyncSession,
    job: Job,
    kind: str,
    *,
    actor: str = "user",
    from_status: str | None = None,
    to_status: str | None = None,
    confidence: float | None = None,
    ref_id: str | None = None,
    meta: dict | None = None,
    at: datetime | None = None,
) -> JobEvent:
    event = JobEvent(
        workspace_id=job.workspace_id,
        job_id=job.id,
        kind=kind,
        from_status=from_status,
        to_status=to_status,
        actor=actor,
        confidence=confidence,
        ref_id=ref_id,
        meta=meta or {},
        occurred_at=at or datetime.now(timezone.utc),
    )
    db.add(event)
    return event


def _noon_utc(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, 12, tzinfo=timezone.utc)


def set_date_applied(job: Job, day: date | None, follow_up_days: int | None = None) -> None:
    """The user-visible 'date applied' and the metrics timestamp must always agree.

    For a job still in "applied", the follow-up reminder counts from the day it was actually
    sent, so back-dating an application can make it immediately due.
    """
    job.date_applied = day
    if day is None:
        return
    if job.status in LIVE_STATUSES or job.status == JobStatus.REJECTED.value:
        job.applied_at = _noon_utc(day)
    if follow_up_days is not None and job.status == JobStatus.APPLIED.value:
        job.follow_up_at = day + timedelta(days=follow_up_days)


async def change_status(
    db: AsyncSession,
    job: Job,
    new_status: JobStatus | str,
    *,
    actor: str = "user",
    confidence: float | None = None,
    ref_id: str | None = None,
    meta: dict | None = None,
    now: datetime | None = None,
    follow_up_days: int | None = None,
) -> JobEvent | None:
    """Move `job` to `new_status`, keeping its derived fields and audit trail consistent.

    Returns the recorded event, or None when the status is unchanged. Raises TransitionNotAllowed
    when an automated actor attempts a move it may not make. The caller owns the transaction.
    """
    if actor not in ACTORS:
        raise ValueError(f"Unknown actor '{actor}'")
    new = status_value(new_status)
    old = status_value(job.status)
    if old == new:
        return None
    if not can_transition(actor, old, new):
        raise TransitionNotAllowed(f"{actor} may not move a job from {old} to {new}")

    now = now or datetime.now(timezone.utc)
    if follow_up_days is None:
        follow_up_days = await workspace_settings.follow_up_days(db, job.workspace_id)

    if new == JobStatus.WISHLIST.value:
        # Moved back to "saved": it no longer counts as applied. History stays in job_events.
        job.applied_at = None
        job.follow_up_at = None
    elif new in LIVE_STATUSES and job.applied_at is None:
        job.applied_at = now
        if job.date_applied is None:
            job.date_applied = now.date()

    if _is_reply(old, new):
        job.last_reply_at = now
    if new == JobStatus.INTERVIEW.value and job.interview_at is None:
        job.interview_at = now

    if new in FOLLOW_UP_STATUSES:
        job.follow_up_at = (now + timedelta(days=follow_up_days)).date()
    elif new != JobStatus.WISHLIST.value:
        job.follow_up_at = None  # rejected / offer / negotiating: nothing left to chase

    job.status = new
    event = record_event(
        db, job, "status_changed",
        actor=actor, from_status=old, to_status=new,
        confidence=confidence, ref_id=ref_id, meta=meta, at=now,
    )
    await db.flush()
    return event
