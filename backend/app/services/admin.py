import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plan import Plan
from app.models.subscription import PaymentEvent, Subscription
from app.models.usage import UserUsage
from app.models.user import User


async def get_overview(db: AsyncSession) -> dict:
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()

    active = (
        await db.execute(
            select(func.count(Subscription.id)).where(
                Subscription.subscription_status == "active", Subscription.suspended.is_(False)
            )
        )
    ).scalar_one()
    cancelled = (
        await db.execute(select(func.count(Subscription.id)).where(Subscription.subscription_status == "cancelled"))
    ).scalar_one()
    suspended = (await db.execute(select(func.count(Subscription.id)).where(Subscription.suspended.is_(True)))).scalar_one()

    dist_result = await db.execute(
        select(Subscription.plan_id, Plan.name, func.count(Subscription.id))
        .join(Plan, Plan.id == Subscription.plan_id, isouter=True)
        .group_by(Subscription.plan_id, Plan.name)
    )
    plan_distribution = [
        {"plan_id": plan_id or "free", "plan_name": plan_name or "Free", "count": count}
        for plan_id, plan_name, count in dist_result.all()
    ]
    free_users = next((row["count"] for row in plan_distribution if row["plan_id"] == "free"), 0)

    # MRR: active, non-suspended paid subscriptions normalized to a monthly figure.
    mrr_result = await db.execute(
        select(Subscription.billing_cycle, Plan.monthly_price_usd, Plan.annual_price_usd)
        .join(Plan, Plan.id == Subscription.plan_id)
        .where(
            Subscription.subscription_status == "active",
            Subscription.suspended.is_(False),
            Subscription.plan_id != "free",
        )
    )
    mrr = 0.0
    for billing_cycle, monthly_price, annual_price in mrr_result.all():
        if billing_cycle == "annual" and annual_price:
            mrr += float(annual_price) / 12
        elif monthly_price:
            mrr += float(monthly_price)

    return {
        "total_users": total_users,
        "active_subscribers": active,
        "cancelled_subscribers": cancelled,
        "suspended_subscribers": suspended,
        "free_users": free_users,
        "plan_distribution": plan_distribution,
        "mrr_usd": round(mrr, 2),
    }


async def get_revenue_series(db: AsyncSession, days: int = 30) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(PaymentEvent)
        .where(PaymentEvent.event_type.in_(["subscription.charged", "payment.authorized"]))
        .where(PaymentEvent.created_at >= since)
        .order_by(PaymentEvent.created_at)
    )
    events = list(result.scalars().all())

    buckets: dict[str, dict] = {}
    for e in events:
        day = e.created_at.date().isoformat()
        entity = ((e.payload.get("payload", {}) or {}).get("payment", {}) or {}).get("entity", {}) or {}
        amount = (entity.get("amount") or 0) / 100  # Razorpay amounts are in the smallest currency unit
        bucket = buckets.setdefault(day, {"amount_usd": 0.0, "event_count": 0})
        bucket["amount_usd"] += amount
        bucket["event_count"] += 1

    return [
        {"date": day, "amount_usd": round(v["amount_usd"], 2), "event_count": v["event_count"]}
        for day, v in sorted(buckets.items())
    ]


async def list_subscriptions(db: AsyncSession, limit: int = 50, offset: int = 0) -> list[dict]:
    result = await db.execute(
        select(Subscription, User)
        .join(User, User.id == Subscription.user_id)
        .order_by(Subscription.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = []
    for sub, user in result.all():
        rows.append(
            {
                "id": sub.id,
                "user_id": sub.user_id,
                "email": user.email,
                "full_name": user.full_name,
                "plan": sub.plan_id or sub.plan or "free",
                "subscription_status": sub.subscription_status,
                "billing_cycle": sub.billing_cycle,
                "current_period_end": sub.current_period_end,
                "cancel_at_period_end": sub.cancel_at_period_end,
                "suspended": sub.suspended,
                "created_at": sub.created_at,
            }
        )
    return rows


async def list_usage(db: AsyncSession, limit: int = 50) -> list[dict]:
    today = date.today()
    result = await db.execute(
        select(UserUsage, User, Subscription)
        .join(User, User.id == UserUsage.user_id)
        .join(Subscription, Subscription.user_id == UserUsage.user_id, isouter=True)
        .where(UserUsage.period_start <= today, UserUsage.period_end > today)
        .order_by((UserUsage.job_tracks_used + UserUsage.cover_letters_used).desc())
        .limit(limit)
    )
    rows = []
    for usage, user, sub in result.all():
        rows.append(
            {
                "user_id": usage.user_id,
                "email": user.email,
                "plan": (sub.plan_id if sub else None) or "free",
                "job_tracks_used": usage.job_tracks_used,
                "cover_letters_used": usage.cover_letters_used,
                "period_start": usage.period_start.isoformat(),
            }
        )
    return rows
