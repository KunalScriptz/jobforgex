"""Cross-workspace queries for the admin dashboard.

Everything here returns metadata and aggregates only: counts, timestamps, costs, statuses. Never
job titles, descriptions, resumes or LaTeX. That is a deliberate privacy boundary; keep it when
adding queries.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import Date, cast, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AIFailureLog, AdminAuditLog
from app.models.ai_cost_log import AICostLog
from app.models.job import Job, JobArtifact
from app.models.user import User
from app.models.user_role import UserRole
from app.models.workspace import Workspace
from app.services import instance_settings


def _month_start(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _day(col):
    # A literal, not a bound parameter: Postgres can only match the SELECT expression to the
    # GROUP BY expression when both are textually identical, and $1 vs $3 are not.
    return cast(func.timezone(literal_column("'UTC'"), col), Date)


def _fill_days(rows: dict[date, dict], days: int, empty: dict) -> list[dict]:
    today = datetime.now(timezone.utc).date()
    out = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        out.append({"date": d.isoformat(), **rows.get(d, empty)})
    return out


def _f(value) -> float:
    return float(value or 0)


async def overview(db: AsyncSession, days: int = 30) -> dict:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    month_start = _month_start(now)

    async def scalar(stmt):
        return (await db.execute(stmt)).scalar_one()

    total_users = await scalar(select(func.count()).select_from(User))
    active_24h = await scalar(select(func.count()).select_from(User).where(User.last_login_at >= now - timedelta(hours=24)))
    active_7d = await scalar(select(func.count()).select_from(User).where(User.last_login_at >= now - timedelta(days=7)))
    new_in_window = await scalar(select(func.count()).select_from(User).where(User.created_at >= since))
    onboarded = await scalar(select(func.count()).select_from(Workspace).where(Workspace.onboarding_complete.is_(True)))
    total_jobs = await scalar(select(func.count()).select_from(Job))

    jobs_by_status = {
        status: n
        for status, n in (await db.execute(select(Job.status, func.count()).group_by(Job.status))).all()
    }

    signup_rows = {
        d: {"signups": n}
        for d, n in (
            await db.execute(select(_day(User.created_at), func.count()).where(User.created_at >= since).group_by(_day(User.created_at)))
        ).all()
    }
    ai_rows = {
        d: {"calls": calls, "tokens": int(tokens or 0), "cost": _f(cost)}
        for d, calls, tokens, cost in (
            await db.execute(
                select(_day(AICostLog.created_at), func.count(), func.sum(AICostLog.total_tokens), func.sum(AICostLog.total_cost))
                .where(AICostLog.created_at >= since)
                .group_by(_day(AICostLog.created_at))
            )
        ).all()
    }
    by_purpose = [
        {"purpose": purpose, "calls": calls, "cost": _f(cost)}
        for purpose, calls, cost in (
            await db.execute(
                select(AICostLog.purpose, func.count(), func.sum(AICostLog.total_cost))
                .where(AICostLog.created_at >= since)
                .group_by(AICostLog.purpose)
                .order_by(func.sum(AICostLog.total_cost).desc())
            )
        ).all()
    ]
    month_cost = await scalar(
        select(func.coalesce(func.sum(AICostLog.total_cost), 0)).where(AICostLog.created_at >= month_start)
    )
    top_spenders = [
        {"email": email, "calls": calls, "cost": _f(cost)}
        for email, calls, cost in (
            await db.execute(
                select(User.email, func.count(), func.sum(AICostLog.total_cost))
                .join(User, User.id == AICostLog.user_id)
                .where(AICostLog.created_at >= month_start)
                .group_by(User.email)
                .order_by(func.sum(AICostLog.total_cost).desc())
                .limit(5)
            )
        ).all()
    ]

    return {
        "days": days,
        "totals": {
            "users": total_users,
            "active_24h": active_24h,
            "active_7d": active_7d,
            "new_in_window": new_in_window,
            "onboarded": onboarded,
            "jobs": total_jobs,
            "ai_cost_this_month": _f(month_cost),
        },
        "jobs_by_status": jobs_by_status,
        "signups_by_day": _fill_days(signup_rows, days, {"signups": 0}),
        "ai_by_day": _fill_days(ai_rows, days, {"calls": 0, "tokens": 0, "cost": 0.0}),
        "ai_by_purpose": by_purpose,
        "top_spenders": top_spenders,
    }


async def list_users(db: AsyncSession, search: str | None, page: int, page_size: int) -> dict:
    month_start = _month_start()
    jobs_sq = select(Job.workspace_id.label("ws"), func.count().label("n")).group_by(Job.workspace_id).subquery()
    spend_sq = (
        select(AICostLog.workspace_id.label("ws"), func.sum(AICostLog.total_cost).label("spent"))
        .where(AICostLog.created_at >= month_start)
        .group_by(AICostLog.workspace_id)
        .subquery()
    )

    filters = []
    if search and search.strip():
        like = f"%{search.strip()}%"
        filters.append(or_(User.email.ilike(like), User.full_name.ilike(like)))

    total = (await db.execute(select(func.count()).select_from(User).where(*filters))).scalar_one()
    stmt = (
        select(User, UserRole.role, Workspace, jobs_sq.c.n, spend_sq.c.spent)
        .outerjoin(UserRole, UserRole.user_id == User.id)
        .outerjoin(Workspace, Workspace.owner_user_id == User.id)
        .outerjoin(jobs_sq, jobs_sq.c.ws == Workspace.id)
        .outerjoin(spend_sq, spend_sq.c.ws == Workspace.id)
        .where(*filters)
        .order_by(User.created_at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    default_cap = (await instance_settings.get_all(db))["default_ai_monthly_cap_usd"]

    items = []
    seen: set[uuid.UUID] = set()
    for user, role, ws, job_count, spent in (await db.execute(stmt)).all():
        if user.id in seen:  # a user with several workspaces: list them once
            continue
        seen.add(user.id)
        override = ws.admin_ai_cap_usd if ws else None
        effective = override if override is not None else default_cap
        items.append(
            {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "role": role or "user",
                "created_at": user.created_at,
                "last_login_at": user.last_login_at,
                "onboarding_complete": bool(ws.onboarding_complete) if ws else False,
                "jobs": job_count or 0,
                "ai_cost_this_month": _f(spent),
                "ai_cap_override": _f(override) if override is not None else None,
                "ai_cap_effective": _f(effective) if effective is not None else None,
            }
        )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def set_user_ai_cap(db: AsyncSession, user_id: uuid.UUID, cap: Decimal | None) -> bool:
    ws = (await db.execute(select(Workspace).where(Workspace.owner_user_id == user_id).limit(1))).scalar_one_or_none()
    if ws is None:
        return False
    ws.admin_ai_cap_usd = cap
    await db.flush()
    return True


async def admin_count(db: AsyncSession) -> int:
    return (
        await db.execute(select(func.count()).select_from(UserRole).where(UserRole.role == "admin"))
    ).scalar_one()


async def audit(
    db: AsyncSession,
    admin: dict,
    action: str,
    target_user_id: uuid.UUID | None = None,
    target_email: str | None = None,
    detail: dict | None = None,
) -> None:
    db.add(
        AdminAuditLog(
            admin_user_id=uuid.UUID(admin["user_id"]),
            admin_email=admin.get("email") or "",
            action=action,
            target_user_id=target_user_id,
            target_email=target_email,
            detail=detail,
        )
    )
    await db.flush()


def _first_line(text: str | None, limit: int = 120) -> str:
    """First line only, capped. Compiler logs echo fragments of the document, so we keep just
    enough to tell failure kinds apart, not the surrounding source."""
    return (text or "").strip().splitlines()[0][:limit] if (text or "").strip() else ""


async def recent_failures(db: AsyncSession, limit: int = 50) -> dict:
    ai_rows = (
        await db.execute(
            select(AIFailureLog, User.email)
            .outerjoin(User, User.id == AIFailureLog.user_id)
            .order_by(AIFailureLog.created_at.desc())
            .limit(limit)
        )
    ).all()
    compile_rows = (
        await db.execute(
            select(JobArtifact.kind, JobArtifact.compile_error, JobArtifact.created_at, User.email)
            .join(Workspace, Workspace.id == JobArtifact.workspace_id)
            .join(User, User.id == Workspace.owner_user_id)
            .where(JobArtifact.compile_error.isnot(None), JobArtifact.compile_error != "")
            .order_by(JobArtifact.created_at.desc())
            .limit(limit)
        )
    ).all()
    return {
        "ai": [
            {
                "at": f.created_at,
                "email": email,
                "purpose": f.purpose,
                "kind": f.error_kind,
                "message": _first_line(f.message, 200),
            }
            for f, email in ai_rows
        ],
        "latex": [
            {"at": at, "email": email, "artifact": kind, "message": _first_line(err)}
            for kind, err, at, email in compile_rows
        ],
    }


async def recent_audit(db: AsyncSession, limit: int = 100) -> list[dict]:
    rows = (await db.execute(select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit))).scalars().all()
    return [
        {
            "at": r.created_at,
            "admin_email": r.admin_email,
            "action": r.action,
            "target_email": r.target_email,
            "detail": r.detail,
        }
        for r in rows
    ]
