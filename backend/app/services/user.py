import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_profile(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def update_profile(db: AsyncSession, user_id: uuid.UUID, **fields) -> User | None:
    user = await get_profile(db, user_id)
    if not user:
        return None

    # If salary is cleared, drop its currency/frequency too so the profile stays coherent.
    if "current_salary" in fields and (fields["current_salary"] is None):
        fields.setdefault("salary_currency", None)
        fields.setdefault("salary_frequency", None)

    for key, value in fields.items():
        if hasattr(user, key):
            setattr(user, key, value)

    await db.flush()
    return user
