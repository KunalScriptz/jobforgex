from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime, date
from enum import Enum

from app.models.job import JobStatus

# Single source of truth: the API accepts/returns exactly the model's statuses.
JobStatusEnum = JobStatus


class ArtifactKindEnum(str, Enum):
    tailored_resume = "tailored_resume"
    cover_letter = "cover_letter"
    ai_tool = "ai_tool"
    pdf = "pdf"


class JobCreate(BaseModel):
    board_id: UUID
    company: str = Field(min_length=1, max_length=200)
    company_domain: Optional[str] = Field(None, max_length=255)
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=100000)
    url: Optional[str] = Field(None, max_length=1000)
    notes: Optional[str] = Field(None, max_length=5000)
    location: Optional[str] = Field(None, max_length=200)
    status: JobStatusEnum = JobStatusEnum.WISHLIST
    date_applied: Optional[date] = None
    resume_score: Optional[int] = None


class JobUpdate(BaseModel):
    company: Optional[str] = Field(None, min_length=1, max_length=200)
    company_domain: Optional[str] = Field(None, max_length=255)
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=100000)
    url: Optional[str] = Field(None, max_length=1000)
    notes: Optional[str] = Field(None, max_length=5000)
    location: Optional[str] = Field(None, max_length=200)
    status: Optional[JobStatusEnum] = None
    date_applied: Optional[date] = None
    board_id: Optional[UUID] = None


class BulkStatusUpdate(BaseModel):
    ids: list[UUID] = Field(min_length=1, max_length=200)
    status: JobStatusEnum


class BulkDelete(BaseModel):
    ids: list[UUID] = Field(min_length=1, max_length=500)


class JobSearchParams(BaseModel):
    board_id: Optional[UUID] = None
    search: Optional[str] = None
    status: Optional[JobStatusEnum] = None


class JobOut(BaseModel):
    id: UUID
    workspace_id: UUID
    board_id: UUID
    company: str
    company_domain: Optional[str] = None
    title: str
    description: str
    url: Optional[str] = None
    notes: Optional[str] = None
    location: Optional[str] = None
    status: JobStatusEnum
    date_applied: Optional[date] = None
    resume_score: Optional[int] = None
    insights: Optional[dict] = None
    base_fit_score: Optional[dict] = None
    source: str = "manual"
    apply_url: Optional[str] = None
    applied_at: Optional[datetime] = None
    last_reply_at: Optional[datetime] = None
    interview_at: Optional[datetime] = None
    tailored_at: Optional[datetime] = None
    follow_up_at: Optional[date] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobCardOut(BaseModel):
    """Slim job for lists and boards: no description, notes or insights (those can be 100 KB each
    and the Tracker re-fetches every few seconds). `fit` is the base resume's score, if any."""

    id: UUID
    board_id: UUID
    company: str
    company_domain: Optional[str] = None
    title: str
    url: Optional[str] = None
    location: Optional[str] = None
    status: JobStatusEnum
    source: str = "manual"
    date_applied: Optional[date] = None
    resume_score: Optional[int] = None
    fit: Optional[int] = None
    tailored_at: Optional[datetime] = None
    applied_at: Optional[datetime] = None
    last_reply_at: Optional[datetime] = None
    interview_at: Optional[datetime] = None
    follow_up_at: Optional[date] = None
    created_at: datetime
    updated_at: datetime


class JobEventOut(BaseModel):
    id: UUID
    job_id: UUID
    kind: str
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    actor: str
    confidence: Optional[float] = None
    meta: dict = {}
    occurred_at: datetime

    model_config = {"from_attributes": True}


class FollowUpUpdate(BaseModel):
    follow_up_at: Optional[date] = None


class JobArtifactCreate(BaseModel):
    job_id: UUID
    kind: ArtifactKindEnum
    filename: str
    latex_source: str = ""


class JobArtifactOut(BaseModel):
    id: UUID
    workspace_id: UUID
    job_id: UUID
    kind: ArtifactKindEnum
    filename: str
    latex_source: str
    pdf_storage_path: Optional[str] = None
    compile_error: Optional[str] = None
    fit_score: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class JobDetailOut(BaseModel):
    job: Optional[JobOut] = None
    artifacts: list[JobArtifactOut] = []
    costs: list[dict] = []
