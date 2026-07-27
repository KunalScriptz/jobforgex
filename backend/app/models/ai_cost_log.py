import uuid
import enum
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Integer, ForeignKey, Numeric, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AIPurpose(str, enum.Enum):
    RESUME_TAILORING = "resume_tailoring"
    COVER_LETTER = "cover_letter"
    RESUME_SCORING = "resume_scoring"
    JD_PARSING = "jd_parsing"
    ATS_CHECK = "ats_check"
    CUSTOM = "custom"


class AICostLog(Base):
    __tablename__ = "ai_cost_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True, index=True)
    model_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ai_models.id", ondelete="SET NULL"), nullable=True)
    model_name: Mapped[str] = mapped_column(String, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    input_cost: Mapped[Decimal] = mapped_column(Numeric(10, 6), default=0)
    output_cost: Mapped[Decimal] = mapped_column(Numeric(10, 6), default=0)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(10, 6), default=0)
    purpose: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
