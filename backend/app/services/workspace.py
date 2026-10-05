import uuid
from datetime import datetime

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace import Workspace
from app.models.board import Board
from app.models.ai_provider import AIProvider, AIModel


async def get_workspace_for_user(db: AsyncSession, user_id: uuid.UUID) -> Workspace | None:
    result = await db.execute(
        select(Workspace).where(Workspace.owner_user_id == user_id).order_by(Workspace.created_at).limit(1)
    )
    return result.scalar_one_or_none()


async def create_workspace(db: AsyncSession, user_id: uuid.UUID, name: str, timezone: str = "UTC") -> Workspace:
    existing = await get_workspace_for_user(db, user_id)
    if existing:
        return existing

    ws = Workspace(owner_user_id=user_id, name=name, timezone=timezone, onboarding_step=2)
    db.add(ws)
    await db.flush()

    board = Board(workspace_id=ws.id, name=f"{datetime.utcnow().year} Job Search")
    db.add(board)
    await db.flush()
    return ws


async def update_onboarding_step(
    db: AsyncSession, user_id: uuid.UUID, step: int, complete: bool = False
) -> Workspace | None:
    result = await db.execute(select(Workspace).where(Workspace.owner_user_id == user_id).limit(1))
    ws = result.scalar_one_or_none()
    if not ws:
        return None
    ws.onboarding_step = step
    ws.onboarding_complete = complete
    await db.flush()
    return ws


async def list_boards(db: AsyncSession, workspace_id: uuid.UUID) -> list[Board]:
    result = await db.execute(
        select(Board).where(Board.workspace_id == workspace_id).order_by(Board.created_at)
    )
    return list(result.scalars().all())


async def create_board(db: AsyncSession, workspace_id: uuid.UUID, name: str) -> Board:
    board = Board(workspace_id=workspace_id, name=name)
    db.add(board)
    await db.flush()
    return board


async def rename_board(
    db: AsyncSession, workspace_id: uuid.UUID, board_id: uuid.UUID, name: str
) -> bool:
    """Returns False when the board isn't in this workspace."""
    result = await db.execute(
        select(Board).where(Board.id == board_id, Board.workspace_id == workspace_id)
    )
    board = result.scalar_one_or_none()
    if not board:
        return False
    board.name = name
    await db.flush()
    return True


async def delete_board(db: AsyncSession, workspace_id: uuid.UUID, board_id: uuid.UUID) -> bool:
    """Returns False when the board isn't in this workspace."""
    result = await db.execute(
        delete(Board).where(Board.id == board_id, Board.workspace_id == workspace_id)
    )
    await db.flush()
    return result.rowcount > 0


async def update_budget(db: AsyncSession, user_id: uuid.UUID, budget: float | None) -> None:
    result = await db.execute(select(Workspace).where(Workspace.owner_user_id == user_id).limit(1))
    ws = result.scalar_one_or_none()
    if ws:
        ws.monthly_budget_usd = budget
        await db.flush()
