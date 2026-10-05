import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.services import workspace as workspace_service


async def get_workspace_id(user: dict, db: AsyncSession) -> uuid.UUID:
    """Resolve the caller's workspace id (404 if they have none yet)."""
    ws = await workspace_service.get_workspace_for_user(db, uuid.UUID(user["user_id"]))
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return ws.id


async def current_workspace_id(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    """FastAPI dependency form of get_workspace_id: `ws_id: uuid.UUID = Depends(current_workspace_id)`."""
    return await get_workspace_id(user, db)
