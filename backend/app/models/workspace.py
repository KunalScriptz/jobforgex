import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, Integer, Numeric, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    timezone: Mapped[str] = mapped_column(String, default="UTC")
    monthly_budget_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    onboarding_step: Mapped[int] = mapped_column(Integer, default=1)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    plan: Mapped[str] = mapped_column(String, default="free")
    currency: Mapped[str] = mapped_column(String, default="USD")
    trial_apps_limit: Mapped[int] = mapped_column(Integer, default=2)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner: Mapped["User"] = relationship(back_populates="workspaces")
    boards: Mapped[list["Board"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    ai_providers: Mapped[list["AIProvider"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    ai_models: Mapped[list["AIModel"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    resumes: Mapped[list["Resume"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    jobs: Mapped[list["Job"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
