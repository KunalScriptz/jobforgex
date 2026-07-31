import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user, get_current_workspace
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceUpdate,
    WorkspaceOut,
    BoardCreate,
    BoardUpdate,
    BoardOut,
    BudgetUpdate,
)
from app.services import workspace as workspace_service

router = APIRouter(prefix="/api/v1/workspace", tags=["workspace"])


@router.get("/me", response_model=WorkspaceOut | None)
async def get_my_workspace(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await workspace_service.get_workspace_for_user(db, uuid.UUID(user["user_id"]))
    return ws


@router.post("/create", response_model=WorkspaceOut)
async def create_workspace(
    data: WorkspaceCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await workspace_service.create_workspace(
        db,
        uuid.UUID(user["user_id"]),
        data.name,
        data.timezone,
    )
    return ws


@router.post("/onboarding")
async def update_onboarding(
    step: int,
    complete: bool = False,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await workspace_service.update_onboarding_step(
        db,
        uuid.UUID(user["user_id"]),
        step,
        complete,
    )
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return {"ok": True, "step": step, "complete": complete}


@router.get("/boards", response_model=list[BoardOut])
async def list_boards(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await workspace_service.get_workspace_for_user(db, uuid.UUID(user["user_id"]))
    if not ws:
        return []
    return await workspace_service.list_boards(db, ws.id)


@router.post("/boards", response_model=BoardOut)
async def create_board(
    data: BoardCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await workspace_service.get_workspace_for_user(db, uuid.UUID(user["user_id"]))
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return await workspace_service.create_board(db, ws.id, data.name)


@router.put("/boards/{board_id}")
async def rename_board(
    board_id: uuid.UUID,
    data: BoardUpdate,
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.rename_board(db, board_id, data.name)
    return {"ok": True}


@router.delete("/boards/{board_id}")
async def delete_board(
    board_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    await workspace_service.delete_board(db, board_id)
    return {"ok": True}


@router.post("/budget")
async def update_budget(
    data: BudgetUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    val = float(data.monthly_budget_usd) if data.monthly_budget_usd is not None else None
    await workspace_service.update_budget(db, uuid.UUID(user["user_id"]), val)
    return {"ok": True}
