from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime, date
from enum import Enum


class JobStatusEnum(str, Enum):
    wishlist = "wishlist"
    applied = "applied"
    interview = "interview"
    rejected = "rejected"
    offer = "offer"


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
    status: JobStatusEnum = JobStatusEnum.wishlist
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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


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
