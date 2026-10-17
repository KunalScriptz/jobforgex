import asyncio
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies.auth import require_admin
from app.models.admin import SignupAllowlist
from app.models.user import User
from app.models.user_role import UserRole
from app.services import admin as admin_service
from app.services import instance_settings
from app.services.email import send_email_background
from app.services.health import run_health_checks

# Every route here depends on require_admin. That guard (and the test in tests/test_admin.py)
# is the whole access model, so don't add a route to this router without it.
router = APIRouter(prefix="/api/v1/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# --------------------------------------------------------------------------- overview / health
@router.get("/overview")
async def get_overview(
    days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
):
    return await admin_service.overview(db, days)


@router.get("/health")
async def get_health():
    # The checks are blocking (sockets, Celery inspect), so keep them off the event loop.
    checks = await asyncio.to_thread(run_health_checks)
    return {"ok": all(c["ok"] for c in checks), "checks": checks}


@router.post("/summary/send")
async def send_summary_now():
    """Queue the daily admin summary right now (ignores the toggle and the once-a-day guard)."""
    from app.services.email import smtp_configured
    from app.tasks.admin_digest import send_admin_summary

    if not smtp_configured():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SMTP is not configured on this instance")
    send_admin_summary.delay(force=True)
    return {"ok": True, "recipients": settings.admin_emails}


@router.get("/failures")
async def get_failures(db: AsyncSession = Depends(get_db)):
    return await admin_service.recent_failures(db)


@router.get("/audit")
async def get_audit(db: AsyncSession = Depends(get_db)):
    return {"items": await admin_service.recent_audit(db)}


# --------------------------------------------------------------------------- users
@router.get("/users")
async def get_users(
    search: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await admin_service.list_users(db, search, page, page_size)


class DeleteUserRequest(BaseModel):
    confirm_email: str


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    data: DeleteUserRequest,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a user and everything they own (same cascade as self-service deletion)."""
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if str(target.id) == admin["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't delete your own account here. Use Settings, Delete account.",
        )
    if data.confirm_email.strip().lower() != target.email.strip().lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Confirmation email does not match")

    target_role = (
        await db.execute(select(UserRole.role).where(UserRole.user_id == target.id))
    ).scalar_one_or_none()
    if target_role == "admin" and await admin_service.admin_count(db) <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can't delete the last admin")

    email = target.email
    # Audit first, in the same transaction: the log row has no FK to the target so it survives.
    await admin_service.audit(db, admin, "delete_user", target_user_id=target.id, target_email=email)
    await db.delete(target)
    await db.flush()
    send_email_background(email, "account_deleted", frontend_url=settings.FRONTEND_URL)
    return {"ok": True}


class AICapRequest(BaseModel):
    # None clears the override, so the user falls back to the instance default.
    cap_usd: Decimal | None = Field(None, ge=0, le=100000)


@router.put("/users/{user_id}/ai-cap")
async def set_ai_cap(
    user_id: uuid.UUID,
    data: AICapRequest,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if target is None or not await admin_service.set_user_ai_cap(db, user_id, data.cap_usd):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    await admin_service.audit(
        db, admin, "set_ai_cap", target_user_id=target.id, target_email=target.email,
        detail={"cap_usd": str(data.cap_usd) if data.cap_usd is not None else None},
    )
    return {"ok": True}


# --------------------------------------------------------------------------- access / settings
class SettingsUpdate(BaseModel):
    signup_mode: str | None = None
    # "" or null clears the instance-wide cap
    default_ai_monthly_cap_usd: Decimal | None = Field(None, ge=0, le=100000)
    clear_default_cap: bool = False
    notify_signups: bool | None = None
    notify_daily_summary: bool | None = None


def _settings_out(s: dict) -> dict:
    cap = s["default_ai_monthly_cap_usd"]
    return {**s, "default_ai_monthly_cap_usd": float(cap) if cap is not None else None, "admin_emails": settings.admin_emails}


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)):
    return _settings_out(await instance_settings.get_all(db))


@router.put("/settings")
async def update_settings(
    data: SettingsUpdate,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    changes: dict = {}
    if data.signup_mode is not None:
        if data.signup_mode not in instance_settings.SIGNUP_MODES:
            raise HTTPException(
                status_code=422,
                detail=f"signup_mode must be one of {', '.join(instance_settings.SIGNUP_MODES)}",
            )
        await instance_settings.set_value(db, "signup_mode", data.signup_mode)
        changes["signup_mode"] = data.signup_mode
    if data.clear_default_cap:
        await instance_settings.set_value(db, "default_ai_monthly_cap_usd", "")
        changes["default_ai_monthly_cap_usd"] = None
    elif data.default_ai_monthly_cap_usd is not None:
        await instance_settings.set_value(db, "default_ai_monthly_cap_usd", str(data.default_ai_monthly_cap_usd))
        changes["default_ai_monthly_cap_usd"] = str(data.default_ai_monthly_cap_usd)
    for key in ("notify_signups", "notify_daily_summary"):
        value = getattr(data, key)
        if value is not None:
            await instance_settings.set_value(db, key, "true" if value else "false")
            changes[key] = value
    if changes:
        await admin_service.audit(db, admin, "update_settings", detail=changes)
    return _settings_out(await instance_settings.get_all(db))


class AllowlistAdd(BaseModel):
    email: EmailStr


@router.get("/allowlist")
async def get_allowlist(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(SignupAllowlist).order_by(SignupAllowlist.created_at.desc()))).scalars().all()
    return {"items": [{"email": r.email, "created_at": r.created_at} for r in rows]}


@router.post("/allowlist", status_code=status.HTTP_201_CREATED)
async def add_to_allowlist(
    data: AllowlistAdd,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    email = instance_settings.normalize_email(data.email)
    if await db.get(SignupAllowlist, email) is None:
        db.add(SignupAllowlist(email=email, invited_by=uuid.UUID(admin["user_id"])))
        await db.flush()
        await admin_service.audit(db, admin, "allowlist_add", target_email=email)
    return {"ok": True, "email": email}


@router.delete("/allowlist/{email}")
async def remove_from_allowlist(
    email: str,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    email = instance_settings.normalize_email(email)
    row = await db.get(SignupAllowlist, email)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email is not on the allowlist")
    await db.delete(row)
    await db.flush()
    await admin_service.audit(db, admin, "allowlist_remove", target_email=email)
    return {"ok": True}
