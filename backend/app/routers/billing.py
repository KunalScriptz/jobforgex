import uuid
import base64
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.billing import (
    BillingStatusOut,
    CreateSubscriptionRequest,
    CancelSubscriptionRequest,
    SubscriptionOut,
    BillingHistoryItemOut,
    PricingOut,
)
from app.schemas.usage import UsageOut
from app.services import subscription as subscription_service
from app.services import usage as usage_service
from app.config import settings
from app.models.subscription import Subscription
from app.models.plan import Plan, GeoPricing
from sqlalchemy import select
import httpx

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


@router.get("/status", response_model=BillingStatusOut)
async def billing_status(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(user["user_id"])
    sub = await subscription_service.get_subscription_for_user(db, user_id)
    plan = await usage_service.get_active_plan(db, user_id, sub=sub)
    job_tracks = await usage_service.can_create_job_track(db, user_id)

    is_pro = plan.id != "free"

    return BillingStatusOut(
        plan=plan.id,
        currency="USD",
        trial_used=job_tracks.used,
        trial_limit=job_tracks.limit if job_tracks.limit is not None else -1,
        has_pro=is_pro,
        current_period_end=sub.current_period_end if sub else None,
        cancel_at_period_end=bool(sub.cancel_at_period_end) if sub else False,
    )


@router.get("/usage", response_model=UsageOut)
async def get_usage(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    snapshot = await usage_service.get_usage_snapshot(db, uuid.UUID(user["user_id"]))
    return UsageOut(**snapshot)


@router.post("/subscription/create")
async def create_subscription(
    data: CreateSubscriptionRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    key_id = settings.RAZORPAY_KEY_ID.strip()
    key_secret = settings.RAZORPAY_KEY_SECRET.strip()
    if not key_id or not key_secret:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Razorpay not configured")

    country_code = data.country_code.upper()
    user_id = uuid.UUID(user["user_id"])

    # Server-side resolution only — never trust a client-supplied plan/price.
    razorpay_plan_id = await subscription_service.resolve_razorpay_plan_id(
        db, data.plan_id, data.billing_cycle, country_code
    )
    if not razorpay_plan_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Plan not available in your region")

    existing = await subscription_service.get_subscription_for_user(db, user_id)
    if existing and existing.razorpay_subscription_id and existing.subscription_status == "active":
        return {
            "subscription_id": existing.razorpay_subscription_id,
            "already_active": True,
            "key_id": key_id,
        }

    auth = base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()
    body = {
        "plan_id": razorpay_plan_id,
        "total_count": 10 if data.billing_cycle == "annual" else 120,
        "customer_notify": 1,
        "notes": {
            "user_id": str(user_id),
            "plan_id": data.plan_id,
            "billing_cycle": data.billing_cycle,
            "country_code": country_code,
            "email": user.get("email", ""),
        },
    }
    if data.trial and data.plan_id == "pro" and data.billing_cycle == "annual":
        body["trial_period_days"] = 7

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            "https://api.razorpay.com/v1/subscriptions",
            headers={"Content-Type": "application/json", "Authorization": f"Basic {auth}"},
            json=body,
        )
        text = res.text
        if res.status_code != 200:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Razorpay error: {text[:500]}")

    rp_data = json.loads(text)
    rp_sub_id = rp_data.get("id")

    await subscription_service.create_or_update_subscription_from_razorpay(
        db, user_id, data.plan_id, data.billing_cycle, rp_sub_id, rp_data.get("status")
    )

    return {
        "subscription_id": rp_sub_id,
        "short_url": rp_data.get("short_url"),
        "status": rp_data.get("status"),
        "already_active": False,
        "key_id": key_id,
    }


@router.post("/subscription/cancel", response_model=SubscriptionOut)
async def cancel_subscription(
    data: CancelSubscriptionRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sub = await subscription_service.cancel_subscription(db, uuid.UUID(user["user_id"]), data.at_period_end)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    return sub


@router.post("/subscription/reactivate", response_model=SubscriptionOut)
async def reactivate_subscription(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sub = await subscription_service.reactivate_subscription(db, uuid.UUID(user["user_id"]))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    return sub


@router.get("/subscription", response_model=SubscriptionOut | None)
async def get_subscription(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Subscription).where(Subscription.user_id == uuid.UUID(user["user_id"])))
    return result.scalar_one_or_none()


_EVENT_SUMMARIES = {
    "subscription.activated": "Subscription activated",
    "subscription.charged": "Payment charged — subscription renewed",
    "subscription.completed": "Subscription completed",
    "subscription.cancelled": "Subscription cancelled",
    "subscription.paused": "Subscription paused",
    "subscription.resumed": "Subscription resumed",
    "payment.authorized": "Payment authorized",
    "payment.failed": "Payment failed",
}


@router.get("/subscription/history", response_model=list[BillingHistoryItemOut])
async def get_billing_history(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    events = await subscription_service.list_billing_history(db, uuid.UUID(user["user_id"]))
    return [
        BillingHistoryItemOut(
            id=e.id,
            event_type=e.event_type,
            created_at=e.created_at,
            summary=_EVENT_SUMMARIES.get(e.event_type, e.event_type),
        )
        for e in events
    ]


@router.get("/pricing", response_model=list[PricingOut])
async def get_pricing(
    country_code: str = "DEFAULT",
    db: AsyncSession = Depends(get_db),
):
    plans_result = await db.execute(select(Plan).order_by(Plan.sort_order))
    all_plans = list(plans_result.scalars().all())

    geo_result = await db.execute(
        select(GeoPricing).where(
            GeoPricing.country_code.in_([country_code.upper(), "DEFAULT"])
        )
    )
    geo_rows = list(geo_result.scalars().all())

    geo_by_plan: dict[str, list] = {}
    for g in geo_rows:
        geo_by_plan.setdefault(g.plan_id, []).append(g)

    result = []
    for plan in all_plans:
        candidates = geo_by_plan.get(plan.id, [])
        specific = next((g for g in candidates if g.country_code == country_code.upper()), None)
        default_geo = next((g for g in candidates if g.country_code == "DEFAULT"), None)
        geo = specific or default_geo

        monthly = geo.monthly_price if geo else plan.monthly_price_usd
        annual = geo.annual_price if geo else plan.annual_price_usd
        currency = geo.currency if geo else "USD"
        symbol = geo.currency_symbol if geo else "$"
        discount = round((1 - annual / (monthly * 12)) * 100) if monthly > 0 and annual > 0 else 0

        result.append(PricingOut(
            plan_id=plan.id,
            name=plan.name,
            country_code=country_code.upper(),
            currency=currency,
            currency_symbol=symbol,
            monthly_price=monthly,
            annual_price=annual,
            monthly_price_display=f"{symbol}{monthly}",
            annual_price_display=f"{symbol}{annual}",
            annual_discount_pct=discount,
            razorpay_plan_id_monthly=geo.razorpay_plan_id_monthly if geo else None,
            razorpay_plan_id_annual=geo.razorpay_plan_id_annual if geo else None,
            features=plan.features if isinstance(plan.features, list) else [],
        ))

    return result
