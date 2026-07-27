import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Numeric, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class AIProvider(Base):
    __tablename__ = "ai_providers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, default="DeepSeek")
    base_url: Mapped[str] = mapped_column(String, default="https://api.deepseek.com/v1")
    api_key_encrypted: Mapped[bytes | None] = mapped_column(None, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    workspace: Mapped["Workspace"] = relationship(back_populates="ai_providers")
    models: Mapped[list["AIModel"]] = relationship(back_populates="provider", cascade="all, delete-orphan")


class AIModel(Base):
    __tablename__ = "ai_models"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ai_providers.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    input_price_per_1m: Mapped[float] = mapped_column(Numeric(10, 6), default=0.14)
    output_price_per_1m: Mapped[float] = mapped_column(Numeric(10, 6), default=0.28)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    workspace: Mapped["Workspace"] = relationship(back_populates="ai_models")
    provider: Mapped["AIProvider"] = relationship(back_populates="models")
