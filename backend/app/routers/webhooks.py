import json
import hmac
import hashlib
import base64
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import settings
from app.models.subscription import Subscription, PaymentEvent
from app.models.workspace import Workspace
from sqlalchemy import select

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


@router.post("/razorpay")
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret:
        # Fail closed: an unset secret must never be treated as "skip verification" —
        # that would let anyone POST a forged payload and activate/cancel subscriptions.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook secret not configured")

    expected = hmac.new(
        secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")

    event_id = payload.get("event_id", "")
    event_type = payload.get("event", "")

    if event_id:
        existing = await db.execute(
            select(PaymentEvent).where(PaymentEvent.event_id == event_id)
        )
        if existing.scalar_one_or_none():
            return {"ok": True, "skipped": "duplicate"}

    sub_entity = (payload.get("payload", {}) or {}).get("subscription", {}) or {}
    entity = (sub_entity.get("entity", {}) or {})

    rp_sub_id = entity.get("id") or sub_entity.get("id")
    status_val = entity.get("status") or sub_entity.get("status")
    notes = entity.get("notes", {}) or {}

    user_id = notes.get("user_id")

    if user_id and rp_sub_id:
        sub_result = await db.execute(
            select(Subscription).where(Subscription.razorpay_subscription_id == rp_sub_id)
        )
        sub = sub_result.scalar_one_or_none()
        plan_from_notes = notes.get("plan_id", "pro")
        if sub:
            sub.subscription_status = status_val
            if sub.plan == "free":
                sub.plan = plan_from_notes
                sub.plan_id = plan_from_notes
        else:
            sub = Subscription(
                user_id=uuid.UUID(user_id),
                plan=plan_from_notes,
                plan_id=plan_from_notes,
                razorpay_subscription_id=rp_sub_id,
                subscription_status=status_val,
            )
            db.add(sub)

    event = PaymentEvent(
        provider="razorpay",
        event_id=event_id,
        event_type=event_type,
        workspace_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
        payload=payload,
    )
    db.add(event)
    await db.flush()

    return {"ok": True}
