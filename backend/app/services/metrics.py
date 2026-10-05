"""Read-side numbers for the Overview, Today, Setup and Tracker KPI strips.

Everything is derived from the job lifecycle columns that `job_state` maintains (applied_at,
last_reply_at, interview_at, tailored_at, ...) and from `job_events`; nothing here writes.
Windows are "events that happened in the last N days", so a job counts in the stage it *reached*
during the window, regardless of where it sits today.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.extension_token import ExtensionToken
from app.models.job import Job, JobEvent, JobStatus
from app.models.resume import Resume
from app.models.user import User
from app.models.workspace import Workspace
from app.models.workspace_settings import WorkspaceSettings
from app.services import job_state
from app.services import jobs as jobs_service

STALE_SAVED_DAYS = 7
VALID_WINDOWS = (7, 30, 90)


def _tz(name: str | None):
    try:
        return ZoneInfo(name or "UTC")
    except Exception:  # unknown / malformed tz name stored on the workspace
        return timezone.utc


def local_today(now: datetime, tz_name: str | None) -> date:
    return now.astimezone(_tz(tz_name)).date()


def week_start_utc(now: datetime, tz_name: str | None) -> datetime:
    """Start of the current Monday-based week in the workspace's timezone, as a UTC instant."""
    local = now.astimezone(_tz(tz_name))
    monday = (local - timedelta(days=local.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return monday.astimezone(timezone.utc)


def clamp_window(days: int) -> int:
    return days if days in VALID_WINDOWS else 30


async def _workspace(db: AsyncSession, workspace_id: uuid.UUID) -> Workspace:
    return (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one()


# --------------------------------------------------------------------------- funnel & sources
async def funnel(
    db: AsyncSession, workspace_id: uuid.UUID, since: datetime, *, include_pipeline: bool = False
) -> list[dict]:
    """Stage counts for jobs that reached each stage since `since`."""
    row = (
        await db.execute(
            select(
                func.count().filter(Job.created_at >= since).label("discovered"),
                func.count().filter(Job.shortlisted_at >= since).label("shortlisted"),
                func.count().filter(Job.tailored_at >= since).label("tailored"),
                func.count().filter(Job.approved_at >= since).label("approved"),
                func.count().filter(Job.applied_at >= since).label("applied"),
                func.count().filter(Job.last_reply_at >= since).label("replied"),
                func.count().filter(Job.interview_at >= since).label("interviewing"),
            ).where(Job.workspace_id == workspace_id)
        )
    ).one()
    offers = (
        await db.execute(
            select(func.count(func.distinct(JobEvent.job_id))).where(
                JobEvent.workspace_id == workspace_id,
                JobEvent.kind == "status_changed",
                JobEvent.to_status.in_([JobStatus.OFFER.value, JobStatus.NEGOTIATING.value]),
                JobEvent.occurred_at >= since,
            )
        )
    ).scalar_one()

    stages = [("discovered", "Discovered", row.discovered)]
    if include_pipeline:
        stages.append(("shortlisted", "Shortlisted", row.shortlisted))
    stages.append(("tailored", "Tailored", row.tailored))
    if include_pipeline:
        stages.append(("approved", "Approved", row.approved))
    stages += [
        ("applied", "Applied", row.applied),
        ("replied", "Replied", row.replied),
        ("interviewing", "Interviewing", row.interviewing),
        ("offer", "Offer", offers),
    ]
    return [{"key": k, "label": label, "count": int(n)} for k, label, n in stages]


async def sources_table(db: AsyncSession, workspace_id: uuid.UUID, since: datetime) -> list[dict]:
    """Per-board performance. Reply rate is a cohort: of the jobs applied to in the window, how
    many have had a reply (even one that arrived after the window)."""
    applied = Job.applied_at >= since
    rows = (
        await db.execute(
            select(
                Job.source,
                func.count().filter(Job.created_at >= since).label("discovered"),
                func.count().filter(applied).label("applied"),
                func.count().filter(and_(applied, Job.last_reply_at.isnot(None))).label("replied"),
                func.count().filter(and_(applied, Job.interview_at.isnot(None))).label("interviews"),
            )
            .where(Job.workspace_id == workspace_id)
            .group_by(Job.source)
        )
    ).all()
    out = [
        {
            "source": r.source,
            "discovered": int(r.discovered),
            "applied": int(r.applied),
            "replied": int(r.replied),
            "interviews": int(r.interviews),
            "reply_rate": round(r.replied / r.applied, 3) if r.applied else None,
        }
        for r in rows
        if r.discovered or r.applied
    ]
    out.sort(key=lambda r: (r["applied"], r["discovered"]), reverse=True)
    return out


# --------------------------------------------------------------------------- weekly & attention
async def weekly_progress(
    db: AsyncSession, workspace_id: uuid.UUID, now: datetime, tz_name: str | None, target: int
) -> dict:
    start = week_start_utc(now, tz_name)
    done = (
        await db.execute(
            select(func.count()).where(Job.workspace_id == workspace_id, Job.applied_at >= start)
        )
    ).scalar_one()
    weekday = now.astimezone(_tz(tz_name)).weekday()  # Monday = 0
    expected = target * (weekday + 1) / 7
    return {
        "target": target,
        "done": int(done),
        "days_left": 7 - weekday,
        "on_track": done >= expected,
        "week_start": start.isoformat(),
    }


async def attention(
    db: AsyncSession, workspace_id: uuid.UUID, now: datetime, tz_name: str | None
) -> list[dict]:
    today = local_today(now, tz_name)
    due = (
        await db.execute(
            select(func.count()).where(
                Job.workspace_id == workspace_id,
                Job.status.in_(job_state.FOLLOW_UP_STATUSES),
                Job.follow_up_at.isnot(None),
                Job.follow_up_at <= today,
            )
        )
    ).scalar_one()
    stale = (
        await db.execute(
            select(func.count()).where(
                Job.workspace_id == workspace_id,
                Job.status == JobStatus.WISHLIST.value,
                Job.created_at < now - timedelta(days=STALE_SAVED_DAYS),
            )
        )
    ).scalar_one()
    items = []
    if due:
        items.append({"key": "follow_ups_due", "count": int(due)})
    if stale:
        items.append({"key": "stale_saved", "count": int(stale), "days": STALE_SAVED_DAYS})
    return items


# --------------------------------------------------------------------------- tracker KPIs
async def job_stats(db: AsyncSession, workspace_id: uuid.UUID, now: datetime, tz_name: str | None) -> dict:
    by_status = {s.value: 0 for s in JobStatus}
    for status, n in (
        await db.execute(
            select(Job.status, func.count()).where(Job.workspace_id == workspace_id).group_by(Job.status)
        )
    ).all():
        by_status[status] = int(n)

    since = now - timedelta(days=30)
    cohort = (
        await db.execute(
            select(
                func.count().filter(Job.applied_at >= since),
                func.count().filter(and_(Job.applied_at >= since, Job.last_reply_at.isnot(None))),
            ).where(Job.workspace_id == workspace_id)
        )
    ).one()
    applied_30d, replied_30d = int(cohort[0]), int(cohort[1])
    due = (
        await db.execute(
            select(func.count()).where(
                Job.workspace_id == workspace_id,
                Job.status.in_(job_state.FOLLOW_UP_STATUSES),
                Job.follow_up_at.isnot(None),
                Job.follow_up_at <= local_today(now, tz_name),
            )
        )
    ).scalar_one()

    return {
        "total": sum(by_status.values()),
        "by_status": by_status,
        "active": sum(n for s, n in by_status.items() if s in job_state.LIVE_STATUSES),
        "interviewing": by_status[JobStatus.INTERVIEW.value],
        "offers": by_status[JobStatus.OFFER.value] + by_status[JobStatus.NEGOTIATING.value],
        "applied_30d": applied_30d,
        "replied_30d": replied_30d,
        "reply_rate_30d": round(replied_30d / applied_30d, 3) if applied_30d else None,
        "follow_ups_due": int(due),
    }


# --------------------------------------------------------------------------- composed payloads
async def overview(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    window_days: int,
    include_pipeline: bool,
    target: int,
    now: datetime | None = None,
) -> dict:
    now = now or datetime.now(timezone.utc)
    window = clamp_window(window_days)
    since = now - timedelta(days=window)
    ws = await _workspace(db, workspace_id)
    return {
        "window_days": window,
        "funnel": await funnel(db, workspace_id, since, include_pipeline=include_pipeline),
        "weekly": await weekly_progress(db, workspace_id, now, ws.timezone, target),
        "attention": await attention(db, workspace_id, now, ws.timezone),
        "sources": await sources_table(db, workspace_id, since),
    }


async def today(db: AsyncSession, workspace_id: uuid.UUID, target: int, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    ws = await _workspace(db, workspace_id)
    day = local_today(now, ws.timezone)

    async def cards(*conditions, order, limit):
        q = jobs_service.card_query(workspace_id).where(*conditions).order_by(*order).limit(limit)
        return [dict(r) for r in (await db.execute(q)).mappings().all()]

    follow_ups = await cards(
        Job.status.in_(job_state.FOLLOW_UP_STATUSES),
        Job.follow_up_at.isnot(None),
        Job.follow_up_at <= day,
        order=(Job.follow_up_at, Job.id),
        limit=20,
    )
    saved = JobStatus.WISHLIST.value
    ready = await cards(
        Job.status == saved, Job.tailored_at.isnot(None),
        order=(Job.tailored_at.desc(), Job.id), limit=10,
    )
    to_tailor = await cards(
        Job.status == saved, Job.tailored_at.is_(None),
        order=(Job.created_at.desc(), Job.id), limit=10,
    )
    day_start = datetime.combine(day, datetime.min.time(), tzinfo=_tz(ws.timezone)).astimezone(timezone.utc)
    applied_today = (
        await db.execute(
            select(func.count()).where(Job.workspace_id == workspace_id, Job.applied_at >= day_start)
        )
    ).scalar_one()
    return {
        "date": day.isoformat(),
        "applied_today": int(applied_today),
        "weekly": await weekly_progress(db, workspace_id, now, ws.timezone, target),
        "follow_ups": follow_ups,
        "ready_to_apply": ready,
        "to_tailor": to_tailor,
    }


async def setup_checklist(db: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID) -> list[dict]:
    """Getting-started quest. Each item is derived from real data, so it can't drift."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()

    async def exists(q) -> bool:
        return (await db.execute(select(q.exists()))).scalar_one()

    has_resume = await exists(select(Resume.id).where(Resume.workspace_id == workspace_id, Resume.is_base.is_(True)))
    has_job = await exists(select(Job.id).where(Job.workspace_id == workspace_id))
    has_applied = await exists(select(Job.id).where(Job.workspace_id == workspace_id, Job.applied_at.isnot(None)))
    has_token = await exists(select(ExtensionToken.id).where(ExtensionToken.workspace_id == workspace_id))
    set_target = await exists(
        select(WorkspaceSettings.workspace_id).where(WorkspaceSettings.workspace_id == workspace_id)
    )
    profile_done = bool(user and user.full_name and user.location)

    return [
        {"key": "profile", "done": profile_done, "href": "/settings"},
        {"key": "resume", "done": has_resume, "href": "/resumes"},
        {"key": "extension", "done": has_token, "href": "/settings"},
        {"key": "first_job", "done": has_job, "href": "/tracker"},
        {"key": "first_application", "done": has_applied, "href": "/tracker"},
        {"key": "weekly_target", "done": set_target, "href": "/settings"},
    ]
