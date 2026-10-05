from typing import Optional

from pydantic import BaseModel, Field

from app.services.workspace_settings import FOLLOW_UP_DAYS_RANGE, WEEKLY_TARGET_RANGE


class WorkspaceSettingsOut(BaseModel):
    weekly_target: int
    follow_up_days: int


class WorkspaceSettingsUpdate(BaseModel):
    weekly_target: Optional[int] = Field(None, ge=WEEKLY_TARGET_RANGE[0], le=WEEKLY_TARGET_RANGE[1])
    follow_up_days: Optional[int] = Field(None, ge=FOLLOW_UP_DAYS_RANGE[0], le=FOLLOW_UP_DAYS_RANGE[1])
