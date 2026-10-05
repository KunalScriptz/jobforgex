import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies.auth import get_current_user
from app.dependencies.workspace import current_workspace_id
from app.services import metrics
from app.services import workspace_settings as settings_service

router = APIRouter(prefix="/api/v1/overview", tags=["overview"])


@router.get("/summary")
async def overview_summary(
    days: int = Query(30, description="Window in days: 7, 30 or 90"),
    ws_id: uuid.UUID = Depends(current_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Funnel, weekly target, attention items and the per-board reply-rate table."""
    prefs = await settings_service.get_settings(db, ws_id)
    return await metrics.overview(
        db, ws_id,
        window_days=days,
        include_pipeline=settings.FEATURE_PIPELINE,
        target=prefs["weekly_target"],
    )


@router.get("/today")
async def overview_today(
    ws_id: uuid.UUID = Depends(current_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    prefs = await settings_service.get_settings(db, ws_id)
    return await metrics.today(db, ws_id, prefs["weekly_target"])


@router.get("/setup")
async def overview_setup(
    user: dict = Depends(get_current_user),
    ws_id: uuid.UUID = Depends(current_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    items = await metrics.setup_checklist(db, ws_id, uuid.UUID(user["user_id"]))
    return {"items": items, "done": sum(1 for i in items if i["done"]), "total": len(items)}
