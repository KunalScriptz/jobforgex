import json
import hmac
import hashlib
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import settings
from app.models.subscription import PaymentEvent
from app.services.webhook import WEBHOOK_HANDLERS, record_payment_event
from sqlalchemy import select

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


@router.post("/razorpay")
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if secret:
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

    # Idempotency: skip if we've already processed this exact event.
    if event_id:
        existing = await db.execute(
            select(PaymentEvent).where(PaymentEvent.event_id == event_id)
        )
        if existing.scalar_one_or_none():
            return {"ok": True, "skipped": "duplicate"}

    handler = WEBHOOK_HANDLERS.get(event_type)
    user_id = await handler(db, payload) if handler else None

    await record_payment_event(db, event_id, event_type, payload, user_id)

    return {"ok": True, "handled": handler is not None}
