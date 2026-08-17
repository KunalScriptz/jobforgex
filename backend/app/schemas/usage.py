from pydantic import BaseModel
from datetime import date
from typing import Literal, Optional


class UsageMetricOut(BaseModel):
    used: int
    limit: Optional[int] = None
    remaining: Optional[int] = None
    unlimited: bool = False


class UsageOut(BaseModel):
    plan: str
    period_start: date
    period_end: date
    job_tracks: UsageMetricOut
    cover_letters: UsageMetricOut


class PlanLimitErrorOut(BaseModel):
    success: bool = False
    reason: Literal["PLAN_LIMIT_REACHED"] = "PLAN_LIMIT_REACHED"
    message: str
    currentPlan: str
    limit: Optional[int] = None
    used: int
