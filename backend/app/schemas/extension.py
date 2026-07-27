from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime


class ExtensionTokenCreate(BaseModel):
    label: str = ""


class ExtensionTokenOut(BaseModel):
    id: UUID
    user_id: UUID
    workspace_id: UUID
    label: str
    token_prefix: str
    last_used_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExtensionTokenCreatedOut(BaseModel):
    id: UUID
    token: str
    prefix: str
    label: str


class ExtensionJobCreate(BaseModel):
    company: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    url: Optional[str] = Field(None, max_length=1000)
    description: Optional[str] = Field(None, max_length=100000)
    location: Optional[str] = Field(None, max_length=200)
