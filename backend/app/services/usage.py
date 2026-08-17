import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.usage import UserUsage


@dataclass
class UsageCheckResult:
    allowed: bool
    used: int
    limit: int | None
    remaining: int | None
    plan_name: str
    plan_id: str


def _is_entitled(sub: Subscription) -> bool:
    """Whether a subscription currently grants its plan's access (paid tiers only).

    Cancellation doesn't revoke access immediately — Razorpay-style billing keeps
    access until `current_period_end` lapses. Pausing/suspension does revoke it now.
    """
    if sub.suspended:
        return False
    if sub.subscription_status == "paused":
        return False
    if sub.subscription_status in ("active", "cancelled", "authenticated"):
        if sub.current_period_end is None:
            return True
        return sub.current_period_end > datetime.now(timezone.utc)
    return False


async def get_subscription_for_user(db: AsyncSession, user_id: uuid.UUID) -> Subscription | None:
    result = await db.execute(select(Subscription).where(Subscription.user_id == user_id))
    return result.scalar_one_or_none()


async def get_active_plan(db: AsyncSession, user_id: uuid.UUID, sub: Subscription | None = None) -> Plan:
    if sub is None:
        sub = await get_subscription_for_user(db, user_id)

    plan_id = "free"
    if sub and sub.plan_id and sub.plan_id != "free" and _is_entitled(sub):
        plan_id = sub.plan_id

    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        result = await db.execute(select(Plan).where(Plan.id == "free"))
        plan = result.scalar_one_or_none()
    if not plan:
        raise RuntimeError("No 'free' plan row found — check plans table seed data")
    return plan


def get_current_period(sub: Subscription | None) -> tuple[date, date]:
    """Paid, entitled subscriptions use their own Razorpay billing cycle; everyone
    else (free plan, lapsed/inactive subscriptions) uses the calendar month."""
    if sub and sub.current_period_start and sub.current_period_end and _is_entitled(sub):
        return sub.current_period_start.date(), sub.current_period_end.date()

    now = datetime.now(timezone.utc)
    start = date(now.year, now.month, 1)
    end = date(now.year + 1, 1, 1) if now.month == 12 else date(now.year, now.month + 1, 1)
    return start, end


async def get_or_create_usage(
    db: AsyncSession, user_id: uuid.UUID, period_start: date, period_end: date
) -> UserUsage:
    result = await db.execute(
        select(UserUsage).where(UserUsage.user_id == user_id, UserUsage.period_start == period_start)
    )
    usage = result.scalar_one_or_none()
    if usage:
        return usage

    usage = UserUsage(user_id=user_id, period_start=period_start, period_end=period_end)
    db.add(usage)
    await db.flush()
    return usage


async def _check(db: AsyncSession, user_id: uuid.UUID, metric: str) -> UsageCheckResult:
    sub = await get_subscription_for_user(db, user_id)
    plan = await get_active_plan(db, user_id, sub=sub)
    limit = plan.job_track_limit if metric == "job_tracks" else plan.cover_letter_limit

    if limit is None:
        return UsageCheckResult(allowed=True, used=0, limit=None, remaining=None, plan_name=plan.name, plan_id=plan.id)

    period_start, period_end = get_current_period(sub)
    usage = await get_or_create_usage(db, user_id, period_start, period_end)
    used = usage.job_tracks_used if metric == "job_tracks" else usage.cover_letters_used
    remaining = max(0, limit - used)
    return UsageCheckResult(
        allowed=used < limit, used=used, limit=limit, remaining=remaining, plan_name=plan.name, plan_id=plan.id
    )


async def can_create_job_track(db: AsyncSession, user_id: uuid.UUID) -> UsageCheckResult:
    return await _check(db, user_id, "job_tracks")


async def can_generate_cover_letter(db: AsyncSession, user_id: uuid.UUID) -> UsageCheckResult:
    return await _check(db, user_id, "cover_letters")


async def _increment(db: AsyncSession, user_id: uuid.UUID, metric: str) -> None:
    sub = await get_subscription_for_user(db, user_id)
    period_start, period_end = get_current_period(sub)
    usage = await get_or_create_usage(db, user_id, period_start, period_end)
    if metric == "job_tracks":
        usage.job_tracks_used += 1
    else:
        usage.cover_letters_used += 1
    await db.flush()


async def increment_job_track_usage(db: AsyncSession, user_id: uuid.UUID) -> None:
    await _increment(db, user_id, "job_tracks")


async def increment_cover_letter_usage(db: AsyncSession, user_id: uuid.UUID) -> None:
    await _increment(db, user_id, "cover_letters")


async def get_usage_snapshot(db: AsyncSession, user_id: uuid.UUID) -> dict:
    job_tracks = await can_create_job_track(db, user_id)
    cover_letters = await can_generate_cover_letter(db, user_id)
    sub = await get_subscription_for_user(db, user_id)
    period_start, period_end = get_current_period(sub)

    def _metric(r: UsageCheckResult) -> dict:
        return {"used": r.used, "limit": r.limit, "remaining": r.remaining, "unlimited": r.limit is None}

    return {
        "plan": job_tracks.plan_name,
        "period_start": period_start,
        "period_end": period_end,
        "job_tracks": _metric(job_tracks),
        "cover_letters": _metric(cover_letters),
    }
