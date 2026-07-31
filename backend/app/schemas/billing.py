from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime


class BillingStatusOut(BaseModel):
    plan: str
    currency: str
    trial_used: int
    trial_limit: int
    has_pro: bool
    current_period_end: Optional[datetime] = None


class CreateSubscriptionRequest(BaseModel):
    plan_id: str = "pro"
    billing_cycle: str = "monthly"
    country_code: str = "DEFAULT"
    trial: bool = False


class SubscriptionOut(BaseModel):
    id: UUID
    user_id: UUID
    plan: str
    subscription_status: Optional[str] = None
    razorpay_subscription_id: Optional[str] = None
    billing_cycle: Optional[str] = None
    current_period_end: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
    suspended: bool
    created_at: datetime

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
