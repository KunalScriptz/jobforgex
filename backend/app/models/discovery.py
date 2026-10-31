import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# State of a discovered posting in the inbox.
DISCOVERED_NEW = "new"
DISCOVERED_ADDED = "added"
DISCOVERED_DISMISSED = "dismissed"
DISCOVERED_STATES = (DISCOVERED_NEW, DISCOVERED_ADDED, DISCOVERED_DISMISSED)


class DiscoverySearch(Base):
    """A saved search the daily discovery run executes for a workspace."""

    __tablename__ = "discovery_searches"
    __table_args__ = (Index("idx_discovery_searches_workspace", "workspace_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    search_term: Mapped[str] = mapped_column(String(200), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # JobSpy's `country_indeed` (Indeed and Glassdoor default to the USA without it).
    country: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sites: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    is_remote: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    hours_old: Mapped[int] = mapped_column(Integer, nullable=False, default=72, server_default="72")
    results_wanted: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default="30")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Per-source outcome of the last run, e.g. {"indeed": {"ok": true, "found": 12}, "linkedin": {"ok": false, "error": "..."}}.
    last_result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DiscoveredJob(Base):
    """A scraped posting waiting in the inbox. Becomes a `jobs` row only when the user adds it."""

    __tablename__ = "discovered_jobs"
    __table_args__ = (
        Index("uq_discovered_workspace_url_hash", "workspace_id", "url_hash", unique=True),
        Index("idx_discovered_workspace_state", "workspace_id", "state", "first_seen_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    search_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("discovery_searches.id", ondelete="SET NULL"), nullable=True
    )
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    company: Mapped[str] = mapped_column(String(200), nullable=False, default="", server_default="")
    location: Mapped[str | None] = mapped_column(String(300), nullable=True)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    date_posted: Mapped[date | None] = mapped_column(Date, nullable=True)
    salary_text: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_remote: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    url_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Cheap overlap score (0-100), always set. fit_score is the AI score; NULL until scored.
    keyword_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    fit_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fit_reason: Mapped[str | None] = mapped_column(String(400), nullable=True)
    state: Mapped[str] = mapped_column(String(12), nullable=False, default=DISCOVERED_NEW, server_default="new")
    added_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True
    )
    # True when the same company/title/location was already seen from another board.
    possible_duplicate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
