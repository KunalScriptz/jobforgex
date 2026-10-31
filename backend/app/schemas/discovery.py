import uuid
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.services.discovery import HOURS_OLD_RANGE, RESULTS_WANTED_RANGE


class SearchBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    search_term: str = Field(min_length=2, max_length=200)
    location: Optional[str] = Field(None, max_length=200)
    country: Optional[str] = Field(None, max_length=40)
    sites: list[str] = Field(min_length=1, max_length=8)
    is_remote: bool = False
    hours_old: int = Field(72, ge=HOURS_OLD_RANGE[0], le=HOURS_OLD_RANGE[1])
    results_wanted: int = Field(30, ge=RESULTS_WANTED_RANGE[0], le=RESULTS_WANTED_RANGE[1])
    enabled: bool = True


class SearchCreate(SearchBase):
    pass


class SearchUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    search_term: Optional[str] = Field(None, min_length=2, max_length=200)
    location: Optional[str] = Field(None, max_length=200)
    country: Optional[str] = Field(None, max_length=40)
    sites: Optional[list[str]] = Field(None, min_length=1, max_length=8)
    is_remote: Optional[bool] = None
    hours_old: Optional[int] = Field(None, ge=HOURS_OLD_RANGE[0], le=HOURS_OLD_RANGE[1])
    results_wanted: Optional[int] = Field(None, ge=RESULTS_WANTED_RANGE[0], le=RESULTS_WANTED_RANGE[1])
    enabled: Optional[bool] = None


class SearchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    search_term: str
    location: Optional[str]
    country: Optional[str]
    sites: list[str]
    is_remote: bool
    hours_old: int
    results_wanted: int
    enabled: bool
    last_run_at: Optional[datetime]
    last_status: Optional[str]
    last_result: Optional[dict]
    last_error: Optional[str]
    created_at: datetime


class DiscoveredJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    search_id: Optional[uuid.UUID]
    source: str
    title: str
    company: str
    location: Optional[str]
    url: str
    description: str
    date_posted: Optional[date]
    salary_text: Optional[str]
    is_remote: Optional[bool]
    keyword_score: int
    fit_score: Optional[int]
    fit_reason: Optional[str]
    state: str
    added_job_id: Optional[uuid.UUID]
    possible_duplicate: bool
    first_seen_at: datetime


class DiscoveredJobList(BaseModel):
    items: list[DiscoveredJobOut]
    total: int


class BulkAction(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    action: Literal["add", "dismiss"]


class BulkResult(BaseModel):
    done: int
    duplicates: int = 0
    missing: int = 0


class DiscoverySettingsIn(BaseModel):
    enabled: bool


class DiscoveryStatus(BaseModel):
    enabled: bool
    new_count: int
    added_count: int
    dismissed_count: int
    last_run_at: Optional[datetime]
    ai_scored_pending: int
    proxy_configured: bool


class SourceOption(BaseModel):
    name: str
    label: str
    requires_country: bool
    india_only: bool
    needs_proxy_hint: bool


class DiscoveryOptions(BaseModel):
    sources: list[SourceOption]
    countries: list[str]
    max_searches: int
    hours_old_range: tuple[int, int]
    results_wanted_range: tuple[int, int]
