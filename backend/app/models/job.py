import uuid
import enum
from datetime import datetime, date
from sqlalchemy import Index, Numeric, String, Integer, Text, Date, ForeignKey, DateTime, func, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class JobStatus(str, enum.Enum):
    # Application lifecycle. `jobs.status` is VARCHAR(20), so every value must stay <= 20 chars.
    # "interview" keeps its original value for compatibility (the UI labels it "Interviewing").
    WISHLIST = "wishlist"
    APPLIED = "applied"
    ACKNOWLEDGED = "acknowledged"
    SCREENING = "screening"
    INTERVIEW = "interview"
    OFFER = "offer"
    NEGOTIATING = "negotiating"
    REJECTED = "rejected"


class ArtifactKind(str, enum.Enum):
    TAILORED_RESUME = "tailored_resume"
    COVER_LETTER = "cover_letter"
    AI_TOOL = "ai_tool"
    PDF = "pdf"


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        # One row per posting per workspace. NULL url_hash (no URL, or a demoted legacy duplicate)
        # is exempt, which is also what makes ingest's ON CONFLICT DO NOTHING a race-free dedupe.
        Index(
            "uq_jobs_workspace_url_hash", "workspace_id", "url_hash",
            unique=True, postgresql_where=text("url_hash IS NOT NULL"),
        ),
        Index("idx_jobs_workspace_source", "workspace_id", "source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    board_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("boards.id", ondelete="CASCADE"), nullable=False, index=True)
    company: Mapped[str] = mapped_column(String, nullable=False, index=True)
    company_domain: Mapped[str | None] = mapped_column(String, nullable=True)
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

    # Where the job came from and how to recognise it again (see services/job_url.py).
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="manual", server_default="manual")
    external_id: Mapped[str | None] = mapped_column(String, nullable=True)
    apply_url: Mapped[str | None] = mapped_column(String, nullable=True)
    url_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Lifecycle timestamps. Written only by services/job_state.py (status) and services/jobs.py
    # (tailored_at); shortlisted_at / approved_at are filled by the AI pipeline in a later milestone.
    shortlisted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    tailored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_reply_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    interview_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    follow_up_at: Mapped[date | None] = mapped_column(Date, nullable=True)

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


class JobEvent(Base):
    """Append-only audit trail: every status change, plus created / tailored / follow-up moments.

    The funnel, the digest and the timeline are all answered from here, so "applied in the last
    12 hours" means *moved to applied*, not merely "touched".
    """

    __tablename__ = "job_events"
    __table_args__ = (
        Index("idx_job_events_workspace_time", "workspace_id", "occurred_at"),
        Index("idx_job_events_job_time", "job_id", "occurred_at"),
        Index("idx_job_events_workspace_kind", "workspace_id", "kind", "to_status", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # user | extension | pipeline | gmail | discovery | system
    actor: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    ref_id: Mapped[str | None] = mapped_column(String, nullable=True)
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
