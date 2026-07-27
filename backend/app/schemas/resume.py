from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime


class ResumeCreate(BaseModel):
    name: str = "My Resume"
    latex_source: str = ""
    primary_color: str = "#00008c"
    secondary_color: str = "#00a698"
    is_base: bool = False


class ResumeUpdate(BaseModel):
    name: Optional[str] = None
    latex_source: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    page_count: Optional[int] = None


class ResumeOut(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    latex_source: str
    page_count: int
    primary_color: str
    secondary_color: str
    is_base: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ResumeVersionCreate(BaseModel):
    latex_source: str
    note: Optional[str] = None


class ResumeVersionOut(BaseModel):
    id: UUID
    resume_id: UUID
    workspace_id: UUID
    latex_source: str
    note: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CompileRequest(BaseModel):
    artifact_id: UUID


class CompileResult(BaseModel):
    ok: bool
    storage_path: Optional[str] = None
    error: Optional[str] = None


class PdfUrlRequest(BaseModel):
    artifact_id: UUID
    inline: bool = False


class PdfUrlResult(BaseModel):
    url: str
    filename: str
