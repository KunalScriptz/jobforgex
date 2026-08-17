import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import PaymentEvent, Subscription
from app.models.workspace import Workspace
from app.services import usage as usage_service


def _extract_entity(payload: dict, key: str) -> dict:
    return ((payload.get("payload", {}) or {}).get(key, {}) or {}).get("entity", {}) or {}


def _resolve_user_id(entity: dict) -> uuid.UUID | None:
    notes = entity.get("notes", {}) or {}
    raw = notes.get("user_id")
    if not raw:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


def _to_dt(epoch: int | None) -> datetime | None:
    return datetime.fromtimestamp(epoch, tz=timezone.utc) if epoch else None


async def _find_subscription(db: AsyncSession, rp_sub_id: str | None) -> Subscription | None:
    if not rp_sub_id:
        return None
    result = await db.execute(select(Subscription).where(Subscription.razorpay_subscription_id == rp_sub_id))
    return result.scalar_one_or_none()


async def _find_subscription_by_customer(db: AsyncSession, customer_id: str | None) -> Subscription | None:
    if not customer_id:
        return None
    result = await db.execute(select(Subscription).where(Subscription.razorpay_customer_id == customer_id))
    return result.scalar_one_or_none()


async def _get_or_create_subscription(
    db: AsyncSession, user_id: uuid.UUID | None, rp_sub_id: str | None, plan_from_notes: str
) -> Subscription | None:
    sub = await _find_subscription(db, rp_sub_id)
    if sub or not rp_sub_id or not user_id:
        return sub
    sub = Subscription(user_id=user_id, plan=plan_from_notes, plan_id=plan_from_notes, razorpay_subscription_id=rp_sub_id)
    db.add(sub)
    await db.flush()
    return sub


# --- subscription.* handlers -------------------------------------------------

async def handle_subscription_activated(db: AsyncSession, payload: dict) -> uuid.UUID | None:
    entity = _extract_entity(payload, "subscription")
    user_id = _resolve_user_id(entity)
    notes = entity.get("notes", {}) or {}
    sub = await _get_or_create_subscription(db, user_id, entity.get("id"), notes.get("plan_id", "pro"))
    if sub:
        sub.subscription_status = "active"
        sub.current_period_start = _to_dt(entity.get("current_start")) or sub.current_period_start
        sub.current_period_end = _to_dt(entity.get("current_end")) or sub.current_period_end
        if entity.get("customer_id"):
            sub.razorpay_customer_id = entity["customer_id"]
        sub.cancel_at_period_end = False
        sub.cancelled_at = None
        await db.flush()
        user_id = user_id or sub.user_id
    return user_id


async def handle_subscription_charged(db: AsyncSession, payload: dict) -> uuid.UUID | None:
    entity = _extract_entity(payload, "subscription")
    user_id = _resolve_user_id(entity)
    notes = entity.get("notes", {}) or {}
    sub = await _get_or_create_subscription(db, user_id, entity.get("id"), notes.get("plan_id", "pro"))
    if sub:
        sub.subscription_status = "active"
        sub.last_payment_status = "authorized"
        sub.last_payment_at = datetime.now(timezone.utc)
        sub.current_period_start = _to_dt(entity.get("current_start")) or sub.current_period_start
        sub.current_period_end = _to_dt(entity.get("current_end")) or sub.current_period_end
        await db.flush()
        # Pre-create the new period's usage row so dashboards don't show a transient
        # empty state right at rollover.
        if sub.current_period_start and sub.current_period_end:
            await usage_service.get_or_create_usage(
                db, sub.user_id, sub.current_period_start.date(), sub.current_period_end.date()
            )
        user_id = user_id or sub.user_id
    return user_id


async def handle_subscription_completed(db: AsyncSession, payload: dict) -> uuid.UUID | None:
    entity = _extract_entity(payload, "subscription")
    user_id = _resolve_user_id(entity)
    sub = await _find_subscription(db, entity.get("id"))
    if sub:
        sub.subscription_status = "completed"
        await db.flush()
        user_id = user_id or sub.user_id
    return user_id


async def handle_subscription_cancelled(db: AsyncSession, payload: dict) -> uuid.UUID | None:
    entity = _extract_entity(payload, "subscription")
    user_id = _resolve_user_id(entity)
    sub = await _find_subscription(db, entity.get("id"))
    if sub:
        # Access continues until current_period_end naturally lapses — no forced downgrade here.
        sub.subscription_status = "cancelled"
        sub.cancelled_at = datetime.now(timezone.utc)
        await db.flush()
        user_id = user_id or sub.user_id
    return user_id


async def handle_subscription_paused(db: AsyncSession, payload: dict) -> uuid.UUID | None:
    entity = _extract_entity(payload, "subscription")
    user_id = _resolve_user_id(entity)
    sub = await _find_subscription(db, entity.get("id"))
    if sub:
        sub.subscription_status = "paused"
        sub.paused_at = datetime.now(timezone.utc)
        await db.flush()
        user_id = user_id or sub.user_id
    return user_id


async def handle_subscription_resumed(db: AsyncSession, payload: dict) -> uuid.UUID | None:
    entity = _extract_entity(payload, "subscription")
    user_id = _resolve_user_id(entity)
    sub = await _find_subscription(db, entity.get("id"))
    if sub:
        sub.subscription_status = "active"
        sub.paused_at = None
        await db.flush()
        user_id = user_id or sub.user_id
    return user_id


# --- payment.* handlers (informational — status transitions are driven by the
# subscription.* events above, not by bare payment events) -------------------

async def handle_payment_authorized(db: AsyncSession, payload: dict) -> uuid.UUID | None:
    entity = _extract_entity(payload, "payment")
    user_id = _resolve_user_id(entity)
    sub = await usage_service.get_subscription_for_user(db, user_id) if user_id else None
    if not sub:
        sub = await _find_subscription_by_customer(db, entity.get("customer_id"))
    if sub:
        sub.last_payment_status = "authorized"
        sub.last_payment_at = datetime.now(timezone.utc)
        await db.flush()
        user_id = user_id or sub.user_id
    return user_id


async def handle_payment_failed(db: AsyncSession, payload: dict) -> uuid.UUID | None:
    entity = _extract_entity(payload, "payment")
    user_id = _resolve_user_id(entity)
    sub = await usage_service.get_subscription_for_user(db, user_id) if user_id else None
    if not sub:
        sub = await _find_subscription_by_customer(db, entity.get("customer_id"))
    if sub:
        sub.last_payment_status = "failed"
        sub.last_payment_at = datetime.now(timezone.utc)
        await db.flush()
        user_id = user_id or sub.user_id
    return user_id


WEBHOOK_HANDLERS = {
    "subscription.activated": handle_subscription_activated,
    "subscription.charged": handle_subscription_charged,
    "subscription.completed": handle_subscription_completed,
    "subscription.cancelled": handle_subscription_cancelled,
    "subscription.paused": handle_subscription_paused,
    "subscription.resumed": handle_subscription_resumed,
    "payment.authorized": handle_payment_authorized,
    "payment.failed": handle_payment_failed,
}


async def record_payment_event(
    db: AsyncSession, event_id: str, event_type: str, payload: dict, user_id: uuid.UUID | None
) -> PaymentEvent:
    workspace_id = None
    if user_id:
        result = await db.execute(select(Workspace).where(Workspace.owner_user_id == user_id).limit(1))
        ws = result.scalar_one_or_none()
        if ws:
            workspace_id = ws.id

    event = PaymentEvent(
        provider="razorpay",
        event_id=event_id,
        event_type=event_type,
        user_id=user_id,
        workspace_id=workspace_id,
        payload=payload,
    )
    db.add(event)
    await db.flush()
    return event
