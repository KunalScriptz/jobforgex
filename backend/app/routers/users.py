import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.user import UserProfileOut, UserProfileUpdate
from app.services import ratelimit
from app.services import user as user_service
from app.services.auth import decode_digest_unsubscribe_token

logger = logging.getLogger(__name__)

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
        avatar_preset=user.avatar_preset,
        phone=user.phone,
        linkedin_url=user.linkedin_url,
        portfolio_url=user.portfolio_url,
        current_title=user.current_title,
        current_company=user.current_company,
        digest_enabled=user.digest_enabled,
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


class DigestUnsubscribe(BaseModel):
    token: str = Field(min_length=1, max_length=2000)


@router.post("/digest/unsubscribe")
async def unsubscribe_digest(
    data: DigestUnsubscribe,
    db: AsyncSession = Depends(get_db),
):
    """Public, one-click unsubscribe from the link in the digest email.

    The signed token *is* the authentication (it only authorises this one action, and is signed
    with a key that cannot be used as a login). Idempotent, and it answers the same whether or
    not the user still exists, so it can't be used to probe for accounts.
    """
    user_id = decode_digest_unsubscribe_token(data.token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This unsubscribe link is invalid or has expired. You can turn the digest off in Settings.",
        )
    await user_service.update_profile(db, uuid.UUID(user_id), digest_enabled=False)
    return {"ok": True}


@router.post("/me/digest/test", status_code=status.HTTP_202_ACCEPTED)
async def send_test_digest(user: dict = Depends(get_current_user)):
    """Queue a digest to the caller only. Goes through the real path (Redis, worker, SMTP), so
    it doubles as an end-to-end check that digest email delivery works."""
    if not await ratelimit.allow(f"digest-test:{user['user_id']}", limit=3, window_s=3600):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many test digests. Try again in an hour.",
        )

    from app.tasks.digest import send_digest_for_user

    try:
        send_digest_for_user.delay(user["user_id"])
    except Exception:  # broker unreachable, etc.
        logger.exception("could not queue test digest")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not queue the test digest right now. Please try again shortly.",
        )
    return {"queued": True}
