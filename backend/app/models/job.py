import uuid
import enum
from datetime import datetime, date
from sqlalchemy import String, Integer, Text, Date, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class JobStatus(str, enum.Enum):
    WISHLIST = "wishlist"
    APPLIED = "applied"
    INTERVIEW = "interview"
    REJECTED = "rejected"
    OFFER = "offer"


class ArtifactKind(str, enum.Enum):
    TAILORED_RESUME = "tailored_resume"
    COVER_LETTER = "cover_letter"
    AI_TOOL = "ai_tool"
    PDF = "pdf"


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    board_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("boards.id", ondelete="CASCADE"), nullable=False, index=True)
    company: Mapped[str] = mapped_column(String, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    url: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default=JobStatus.WISHLIST.value, index=True)
    date_applied: Mapped[date | None] = mapped_column(Date, nullable=True)
    resume_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    insights: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    base_fit_score: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    workspace: Mapped["Workspace"] = relationship(back_populates="jobs")
    board: Mapped["Board"] = relationship(back_populates="jobs")
    artifacts: Mapped[list["JobArtifact"]] = relationship(back_populates="job", cascade="all, delete-orphan")


class JobArtifact(Base):
    __tablename__ = "job_artifacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    latex_source: Mapped[str] = mapped_column(Text, default="")
    pdf_storage_path: Mapped[str | None] = mapped_column(String, nullable=True)
    compile_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    fit_score: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    job: Mapped["Job"] = relationship(back_populates="artifacts")
