import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class BuilderResume(Base):
    __tablename__ = "builder_resumes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    content: Mapped[dict] = mapped_column(JSONB, default={})
    latex_source: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_path: Mapped[str | None] = mapped_column(String, nullable=True)
    job_match: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    score: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    suggestions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    primary_color: Mapped[str | None] = mapped_column(String, nullable=True)
    secondary_color: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    builder_versions: Mapped[list["BuilderResumeVersion"]] = relationship(back_populates="builder_resume", cascade="all, delete-orphan")


class BuilderResumeVersion(Base):
    __tablename__ = "builder_resume_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    builder_resume_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("builder_resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    content: Mapped[dict] = mapped_column(JSONB, default={})
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    builder_resume: Mapped["BuilderResume"] = relationship(back_populates="builder_versions")
