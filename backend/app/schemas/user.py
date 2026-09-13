from pydantic import BaseModel
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
    profile_complete: bool = False

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
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
