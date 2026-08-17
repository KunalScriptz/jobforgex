import base64
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.plan import GeoPricing
from app.models.subscription import PaymentEvent, Subscription

RAZORPAY_API_BASE = "https://api.razorpay.com/v1"


def _auth_header() -> str:
    key_id = settings.RAZORPAY_KEY_ID.strip()
    key_secret = settings.RAZORPAY_KEY_SECRET.strip()
    return base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()


def _razorpay_configured() -> bool:
    return bool(settings.RAZORPAY_KEY_ID.strip() and settings.RAZORPAY_KEY_SECRET.strip())


async def get_subscription_for_user(db: AsyncSession, user_id: uuid.UUID) -> Subscription | None:
    result = await db.execute(select(Subscription).where(Subscription.user_id == user_id))
    return result.scalar_one_or_none()


async def resolve_razorpay_plan_id(
    db: AsyncSession, plan_id: str, billing_cycle: str, country_code: str
) -> str | None:
    """Server-side lookup of the real Razorpay plan for a (plan, cycle, country) —
    never trust a client-supplied Razorpay plan id or price."""
    result = await db.execute(
        select(GeoPricing)
        .where(GeoPricing.plan_id == plan_id)
        .where(GeoPricing.country_code.in_([country_code, "DEFAULT"]))
    )
    rows = list(result.scalars().all())
    chosen = next((r for r in rows if r.country_code == country_code), None)
    if not chosen:
        chosen = next((r for r in rows if r.country_code == "DEFAULT"), None)
    if not chosen:
        return None
    return chosen.razorpay_plan_id_annual if billing_cycle == "annual" else chosen.razorpay_plan_id_monthly


async def create_or_update_subscription_from_razorpay(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: str,
    billing_cycle: str,
    rp_subscription_id: str,
    rp_status: str | None,
) -> Subscription:
    existing = await get_subscription_for_user(db, user_id)
    if existing:
        existing.plan = plan_id
        existing.plan_id = plan_id
        existing.razorpay_subscription_id = rp_subscription_id
        existing.subscription_status = rp_status
        existing.billing_cycle = billing_cycle
        existing.cancel_at_period_end = False
        existing.cancelled_at = None
        await db.flush()
        return existing

    sub = Subscription(
        user_id=user_id,
        plan=plan_id,
        plan_id=plan_id,
        razorpay_subscription_id=rp_subscription_id,
        subscription_status=rp_status,
        billing_cycle=billing_cycle,
    )
    db.add(sub)
    await db.flush()
    return sub


async def cancel_subscription(db: AsyncSession, user_id: uuid.UUID, at_period_end: bool = True) -> Subscription:
    sub = await get_subscription_for_user(db, user_id)
    if not sub or not sub.razorpay_subscription_id or sub.plan_id == "free":
        raise ValueError("No active paid subscription to cancel")

    if _razorpay_configured():
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                f"{RAZORPAY_API_BASE}/subscriptions/{sub.razorpay_subscription_id}/cancel",
                headers={"Content-Type": "application/json", "Authorization": f"Basic {_auth_header()}"},
                json={"cancel_at_cycle_end": 1 if at_period_end else 0},
            )
            if res.status_code not in (200, 201):
                raise RuntimeError(f"Razorpay cancel failed: {res.text[:500]}")

    if at_period_end:
        sub.cancel_at_period_end = True
    else:
        sub.subscription_status = "cancelled"
        sub.cancelled_at = datetime.now(timezone.utc)
        sub.cancel_at_period_end = False

    await db.flush()
    return sub


async def reactivate_subscription(db: AsyncSession, user_id: uuid.UUID) -> Subscription:
    sub = await get_subscription_for_user(db, user_id)
    if not sub:
        raise ValueError("No subscription found")
    if not sub.cancel_at_period_end:
        raise ValueError("Subscription is not pending cancellation")
    if sub.current_period_end and sub.current_period_end <= datetime.now(timezone.utc):
        raise ValueError("Billing period has already ended — start a new subscription instead")

    if _razorpay_configured() and sub.razorpay_subscription_id:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.patch(
                f"{RAZORPAY_API_BASE}/subscriptions/{sub.razorpay_subscription_id}",
                headers={"Content-Type": "application/json", "Authorization": f"Basic {_auth_header()}"},
                json={"cancel_at_cycle_end": 0},
            )
            if res.status_code not in (200, 201):
                raise RuntimeError(f"Razorpay reactivate failed: {res.text[:500]}")

    sub.cancel_at_period_end = False
    await db.flush()
    return sub


async def list_billing_history(db: AsyncSession, user_id: uuid.UUID, limit: int = 50) -> list[PaymentEvent]:
    result = await db.execute(
        select(PaymentEvent)
        .where(PaymentEvent.user_id == user_id)
        .order_by(PaymentEvent.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
