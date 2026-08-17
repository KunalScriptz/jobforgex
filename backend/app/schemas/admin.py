from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class PlanDistributionOut(BaseModel):
    plan_id: str
    plan_name: str
    count: int


class AdminOverviewOut(BaseModel):
    total_users: int
    active_subscribers: int
    cancelled_subscribers: int
    suspended_subscribers: int
    free_users: int
    plan_distribution: list[PlanDistributionOut]
    mrr_usd: float


class RevenuePointOut(BaseModel):
    date: str
    amount_usd: float
    event_count: int


class AdminSubscriptionOut(BaseModel):
    id: UUID
    user_id: UUID
    email: str
    full_name: Optional[str] = None
    plan: str
    subscription_status: Optional[str] = None
    billing_cycle: Optional[str] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool
    suspended: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminUsageRowOut(BaseModel):
    user_id: UUID
    email: str
    plan: str
    job_tracks_used: int
    cover_letters_used: int
    period_start: str
