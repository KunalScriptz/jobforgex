from pydantic import BaseModel, model_validator
from typing import Optional
from uuid import UUID
from decimal import Decimal


class UserProfileOut(BaseModel):
    id: UUID
    email: str
    full_name: Optional[str] = None
    current_salary: Optional[Decimal] = None
    salary_currency: Optional[str] = None
    salary_frequency: Optional[str] = None
    location: Optional[str] = None
    avatar_preset: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    current_title: Optional[str] = None
    current_company: Optional[str] = None
    digest_enabled: bool = True
    profile_complete: bool = False

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    # Not nullable in the DB: PATCH {"digest_enabled": null} is rejected rather than stored.
    digest_enabled: Optional[bool] = None

    @model_validator(mode="after")
    def _digest_enabled_not_null(self):
        if "digest_enabled" in self.model_fields_set and self.digest_enabled is None:
            raise ValueError("digest_enabled cannot be null")
        return self

    full_name: Optional[str] = None
    current_salary: Optional[Decimal] = None
    salary_currency: Optional[str] = None
    salary_frequency: Optional[str] = None
    location: Optional[str] = None
    avatar_preset: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    current_title: Optional[str] = None
    current_company: Optional[str] = None
