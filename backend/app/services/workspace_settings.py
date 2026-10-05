import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace_settings import (
    DEFAULT_FOLLOW_UP_DAYS,
    DEFAULT_WEEKLY_TARGET,
    WorkspaceSettings,
)

WEEKLY_TARGET_RANGE = (1, 200)
FOLLOW_UP_DAYS_RANGE = (1, 60)


async def get_settings(db: AsyncSession, workspace_id: uuid.UUID) -> dict:
    """Current settings, falling back to defaults when the workspace never saved any."""
    row = (
        await db.execute(select(WorkspaceSettings).where(WorkspaceSettings.workspace_id == workspace_id))
    ).scalar_one_or_none()
    return {
        "weekly_target": row.weekly_target if row else DEFAULT_WEEKLY_TARGET,
        "follow_up_days": row.follow_up_days if row else DEFAULT_FOLLOW_UP_DAYS,
    }


async def follow_up_days(db: AsyncSession, workspace_id: uuid.UUID) -> int:
    return (await get_settings(db, workspace_id))["follow_up_days"]


async def update_settings(db: AsyncSession, workspace_id: uuid.UUID, **values) -> dict:
    """Upsert the given fields (None values are ignored) and return the resulting settings."""
    values = {k: v for k, v in values.items() if v is not None}
    stmt = pg_insert(WorkspaceSettings).values(workspace_id=workspace_id, **values)
    if values:
        stmt = stmt.on_conflict_do_update(index_elements=[WorkspaceSettings.workspace_id], set_=values)
    else:
        stmt = stmt.on_conflict_do_nothing(index_elements=[WorkspaceSettings.workspace_id])
    await db.execute(stmt)
    await db.flush()
    return await get_settings(db, workspace_id)
