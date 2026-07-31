import uuid
import base64
import hashlib
import json
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.billing import (
    BillingStatusOut,
    CreateSubscriptionRequest,
    SubscriptionOut,
    PricingOut,
)
from app.schemas.extension import (
    ExtensionTokenCreate,
    ExtensionTokenOut,
    ExtensionTokenCreatedOut,
    ExtensionJobCreate,
)
from app.services import workspace as workspace_service
from app.services import jobs as jobs_service
from app.models.job import JobStatus
from app.config import settings
from app.models.extension_token import ExtensionToken
from app.models.subscription import Subscription
from app.models.plan import Plan, GeoPricing
from app.models.workspace import Workspace
from app.models.job import JobArtifact, ArtifactKind
from app.models.board import Board
from sqlalchemy import select, delete
from datetime import datetime, timezone
import httpx

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


@router.get("/status", response_model=BillingStatusOut)
async def billing_status(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await workspace_service.get_workspace_for_user(db, uuid.UUID(user["user_id"]))
    if not ws:
        return BillingStatusOut(
            plan="free",
            currency="USD",
            trial_used=0,
            trial_limit=2,
            has_pro=False,
        )

    from app.models.workspace import Workspace as WsModel
    from app.models.subscription import Subscription as SubModel

    ws_result = await db.execute(
        select(WsModel).where(WsModel.owner_user_id == uuid.UUID(user["user_id"])).limit(1)
    )
    ws = ws_result.scalar_one_or_none()

    is_pro = False
    if ws:
        sub_result = await db.execute(select(SubModel).where(SubModel.user_id == uuid.UUID(user["user_id"])))
        sub = sub_result.scalar_one_or_none()
        if sub and sub.subscription_status == "active" and not sub.suspended:
            from datetime import timezone as tz
            if sub.current_period_end is None or sub.current_period_end > datetime.now(tz.utc):
                is_pro = True

    art_result = await db.execute(
        select(JobArtifact)
        .where(JobArtifact.workspace_id == ws.id)
        .where(JobArtifact.kind.in_([ArtifactKind.TAILORED_RESUME, ArtifactKind.COVER_LETTER]))
    )
    arts = list(art_result.scalars().all())
    distinct_jobs = set(str(a.job_id) for a in arts if a.job_id)

    sub_result = await db.execute(select(SubModel).where(SubModel.user_id == uuid.UUID(user["user_id"])))
    sub = sub_result.scalar_one_or_none()

    return BillingStatusOut(
        plan=ws.plan if ws else "free",
        currency=ws.currency if ws else "USD",
        trial_used=len(distinct_jobs),
        trial_limit=int(ws.trial_apps_limit) if ws else 2,
        has_pro=is_pro,
        current_period_end=sub.current_period_end if sub else None,
    )


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

    pricing_result = await db.execute(
        select(GeoPricing)
        .where(GeoPricing.plan_id == data.plan_id)
        .where(GeoPricing.country_code.in_([country_code, "DEFAULT"]))
    )
    rows = list(pricing_result.scalars().all())
    chosen = next((r for r in rows if r.country_code == country_code), None)
    if not chosen:
        chosen = next((r for r in rows if r.country_code == "DEFAULT"), None)

    razorpay_plan_id = (
        chosen.razorpay_plan_id_annual if data.billing_cycle == "annual" else chosen.razorpay_plan_id_monthly
    )
    if not razorpay_plan_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Plan not available in your region")

    existing_result = await db.execute(
        select(Subscription).where(Subscription.user_id == uuid.UUID(user["user_id"]))
    )
    existing = existing_result.scalar_one_or_none()

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
            "user_id": user["user_id"],
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

    if existing:
        existing.plan = data.plan_id
        existing.plan_id = data.plan_id
        existing.razorpay_subscription_id = rp_sub_id
        existing.subscription_status = rp_data.get("status")
        existing.billing_cycle = data.billing_cycle
    else:
        sub = Subscription(
            user_id=uuid.UUID(user["user_id"]),
            plan=data.plan_id,
            plan_id=data.plan_id,
            razorpay_subscription_id=rp_sub_id,
            subscription_status=rp_data.get("status"),
            billing_cycle=data.billing_cycle,
        )
        db.add(sub)

    await db.flush()

    return {
        "subscription_id": rp_sub_id,
        "short_url": rp_data.get("short_url"),
        "status": rp_data.get("status"),
        "already_active": False,
        "key_id": key_id,
    }


@router.get("/subscription", response_model=SubscriptionOut | None)
async def get_subscription(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Subscription).where(Subscription.user_id == uuid.UUID(user["user_id"])))
    return result.scalar_one_or_none()


@router.get("/pricing", response_model=list[PricingOut])
async def get_pricing(
    country_code: str = "DEFAULT",
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GeoPricing).where(GeoPricing.country_code.in_([country_code.upper(), "DEFAULT"]))
    )
    return list(result.scalars().all())
