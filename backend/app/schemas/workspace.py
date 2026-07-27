from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    timezone: str = "UTC"


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    timezone: Optional[str] = None
    monthly_budget_usd: Optional[Decimal] = None
    onboarding_step: Optional[int] = Field(None, ge=1, le=4)
    onboarding_complete: Optional[bool] = None


class WorkspaceOut(BaseModel):
    id: UUID
    owner_user_id: UUID
    name: str
    timezone: str
    monthly_budget_usd: Optional[Decimal] = None
    onboarding_step: int
    onboarding_complete: bool
    plan: str
    currency: str
    trial_apps_limit: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BoardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class BoardUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class BoardOut(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BudgetUpdate(BaseModel):
    monthly_budget_usd: Optional[Decimal] = None
