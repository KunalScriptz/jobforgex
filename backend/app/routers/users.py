import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.user import UserProfileOut, UserProfileUpdate
from app.services import user as user_service

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def _to_out(user) -> UserProfileOut:
    return UserProfileOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        current_salary=user.current_salary,
        salary_currency=user.salary_currency,
        salary_frequency=user.salary_frequency,
        location=user.location,
        profile_complete=bool(user.location),
    )


@router.get("/me", response_model=UserProfileOut)
async def get_me(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await user_service.get_profile(db, uuid.UUID(user["user_id"]))
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _to_out(profile)


@router.patch("/me", response_model=UserProfileOut)
async def update_me(
    data: UserProfileUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fields = data.model_dump(exclude_unset=True)
    profile = await user_service.update_profile(db, uuid.UUID(user["user_id"]), **fields)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _to_out(profile)
