import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

DEFAULT_WEEKLY_TARGET = 10
DEFAULT_FOLLOW_UP_DAYS = 7


class WorkspaceSettings(Base):
    """Per-workspace knobs. A row is created lazily on first write; reads fall back to defaults."""

    __tablename__ = "workspace_settings"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    weekly_target: Mapped[int] = mapped_column(Integer, nullable=False, default=DEFAULT_WEEKLY_TARGET, server_default="10")
    follow_up_days: Mapped[int] = mapped_column(Integer, nullable=False, default=DEFAULT_FOLLOW_UP_DAYS, server_default="7")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
