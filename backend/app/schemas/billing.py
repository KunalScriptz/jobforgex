from pydantic import BaseModel, Field
from typing import Optional, Any
from uuid import UUID
from datetime import datetime


class BillingStatusOut(BaseModel):
    plan: str
    currency: str
    trial_used: int
    trial_limit: int
    has_pro: bool
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False


class CreateSubscriptionRequest(BaseModel):
    plan_id: str = "pro"
    billing_cycle: str = "monthly"
    country_code: str = "DEFAULT"
    trial: bool = False


class CancelSubscriptionRequest(BaseModel):
    at_period_end: bool = True


class SubscriptionOut(BaseModel):
    id: UUID
    user_id: UUID
    plan: str
    subscription_status: Optional[str] = None
    razorpay_subscription_id: Optional[str] = None
    billing_cycle: Optional[str] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False
    trial_ends_at: Optional[datetime] = None
    suspended: bool
    last_payment_status: Optional[str] = None
    last_payment_at: Optional[datetime] = None
    paused_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BillingHistoryItemOut(BaseModel):
    id: UUID
    event_type: str
    created_at: datetime
    summary: str

    model_config = {"from_attributes": True}


class PricingOut(BaseModel):
    plan_id: str
    name: str = ""
    country_code: str
    currency: str
    currency_symbol: str
    monthly_price: float
    annual_price: float
    monthly_price_display: str = ""
    annual_price_display: str = ""
    annual_discount_pct: int = 0
    razorpay_plan_id_monthly: Optional[str] = None
    razorpay_plan_id_annual: Optional[str] = None
    features: list[str] = Field(default_factory=list)
