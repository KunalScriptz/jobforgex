import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies.auth import get_current_user
from app.dependencies.workspace import current_workspace_id
from app.schemas.overview import WorkspaceSettingsOut, WorkspaceSettingsUpdate
from app.services import workspace_settings as settings_service

router = APIRouter(prefix="/api/v1/workspace", tags=["workspace"])


@router.get("/settings", response_model=WorkspaceSettingsOut)
async def get_workspace_settings(
    ws_id: uuid.UUID = Depends(current_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await settings_service.get_settings(db, ws_id)


@router.put("/settings", response_model=WorkspaceSettingsOut)
async def update_workspace_settings(
    data: WorkspaceSettingsUpdate,
    ws_id: uuid.UUID = Depends(current_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await settings_service.update_settings(db, ws_id, **data.model_dump(exclude_none=True))


@router.get("/features")
async def get_features(_: dict = Depends(get_current_user)):
    """Which optional areas are switched on for this deployment. The sidebar hides the rest."""
    return {
        "pipeline": settings.FEATURE_PIPELINE,
        "gmail": settings.FEATURE_GMAIL,
    }
