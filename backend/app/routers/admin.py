from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import require_admin
from app.schemas.admin import (
    AdminOverviewOut,
    AdminSubscriptionOut,
    AdminUsageRowOut,
    RevenuePointOut,
)
from app.services import admin as admin_service

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/stats/overview", response_model=AdminOverviewOut, dependencies=[Depends(require_admin)])
async def stats_overview(db: AsyncSession = Depends(get_db)):
    return await admin_service.get_overview(db)


@router.get("/stats/revenue", response_model=list[RevenuePointOut], dependencies=[Depends(require_admin)])
async def stats_revenue(days: int = 30, db: AsyncSession = Depends(get_db)):
    return await admin_service.get_revenue_series(db, days=days)


@router.get("/subscriptions", response_model=list[AdminSubscriptionOut], dependencies=[Depends(require_admin)])
async def list_subscriptions(limit: int = 50, offset: int = 0, db: AsyncSession = Depends(get_db)):
    return await admin_service.list_subscriptions(db, limit=limit, offset=offset)


@router.get("/usage", response_model=list[AdminUsageRowOut], dependencies=[Depends(require_admin)])
async def list_usage(limit: int = 50, db: AsyncSession = Depends(get_db)):
    return await admin_service.list_usage(db, limit=limit)
