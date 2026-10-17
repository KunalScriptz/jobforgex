from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select
from urllib.parse import urlencode
import uuid as uuid_mod
import asyncio

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.auth import (
    UserRegister,
    UserLogin,
    TokenResponse,
    RefreshRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
    UserOut,
)
from app.services import auth as auth_service
from app.services.email import send_email, send_email_background as _send_email_background
from app.config import settings
from app.services import instance_settings, ratelimit
from app.services.instance_settings import SignupBlockedError
from app.services.email import notify_admins_background
from app.models.user import User
from app.models.workspace import Workspace

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _utc_now_label() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


async def _alert_admins_new_signup(db: AsyncSession, user: dict) -> None:
    """Tell ADMIN_EMAILS (only) that someone signed up. Never raises: a mail problem must not
    break sign-in."""
    import html
    from sqlalchemy import func
    try:
        if not (await instance_settings.get_all(db))["notify_signups"]:
            return
        total = (await db.execute(select(func.count()).select_from(User))).scalar_one()
        notify_admins_background(
            "admin_new_signup",
            email=html.escape(user["email"]),
            name=html.escape(user.get("full_name") or "-"),
            when=_utc_now_label(),
            total_users=total,
            admin_url=f"{settings.FRONTEND_URL}/admin",
        )
    except Exception:
        import logging
        logging.getLogger(__name__).exception("admin signup alert failed")


async def _alert_admins_signup_blocked(db: AsyncSession, blocked: SignupBlockedError) -> None:
    import html
    try:
        if not (await instance_settings.get_all(db))["notify_signups"]:
            return
        # One alert per address per day, so a refresh-happy visitor can't flood the admin.
        if not await ratelimit.allow(f"blocked-signup:{blocked.email.lower()}", 1, 86400):
            return
        notify_admins_background(
            "admin_signup_blocked",
            email=html.escape(blocked.email),
            reason="closed" if blocked.reason == "closed" else "invite-only",
            when=_utc_now_label(),
            admin_url=f"{settings.FRONTEND_URL}/admin?tab=access",
        )
    except Exception:
        import logging
        logging.getLogger(__name__).exception("admin blocked-signup alert failed")


@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    try:
        user_data = await auth_service.register_user(db, data.email, data.password, data.full_name)
    except SignupBlockedError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    result = await auth_service.login_user(db, data.email, data.password)
    return result


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    try:
        return await auth_service.login_user(db, data.email, data.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        return await auth_service.refresh_access_token(db, data.refresh_token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/logout")
async def logout(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    await auth_service.revoke_refresh_token(db, data.refresh_token)
    return {"ok": True}


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    token = await auth_service.create_password_reset_token(db, data.email)
    if token:
        frontend_url = settings.FRONTEND_URL
        reset_url = f"{frontend_url}/auth/reset-password?token={token}"
        await send_email(data.email, "password_reset", reset_url=reset_url)
    return {"ok": True, "message": "If the email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    success = await auth_service.reset_password(db, data.token, data.new_password)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    return {"ok": True, "message": "Password has been reset."}


@router.post("/verify-email")
async def verify_email(data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    success = await auth_service.verify_email(db, data.token)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    return {"ok": True, "message": "Email verified."}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user_id": user.get("user_id"), "email": user.get("email"), "role": user.get("role")}


@router.get("/google/login")
async def google_login():
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Google OAuth not configured")
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url=auth_url)


@router.get("/google/callback")
async def google_callback(code: str = Query(...), db: AsyncSession = Depends(get_db)):
    try:
        result = await auth_service.google_auth_user(db, code)
    except SignupBlockedError as e:
        await _alert_admins_signup_blocked(db, e)
        # A browser is mid-redirect here, so send it back to the app with a reason instead of
        # showing raw JSON from the API domain.
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/auth?error={e.reason}")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    auth_url = settings.FRONTEND_URL
    params = [
        f"token={result['access_token']}",
        f"refresh_token={result['refresh_token']}",
    ]
    if result.get("is_new"):
        params.append("new_user=1")
        frontend_url = settings.FRONTEND_URL
        _send_email_background(result["user"]["email"], "welcome", frontend_url=frontend_url)
        await _alert_admins_new_signup(db, result["user"])
    frontend_callback = f"{auth_url}/auth?{'&'.join(params)}"
    return RedirectResponse(url=frontend_callback)


@router.delete("/account")
async def delete_account(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid_mod.UUID(user["user_id"])
    result = await db.execute(select(User).where(User.id == user_id))
    existing = result.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user_email = existing.email

    await db.delete(existing)
    await db.flush()

    frontend_url = settings.FRONTEND_URL
    _send_email_background(user_email, "account_deleted", frontend_url=frontend_url)

    return {"ok": True, "message": "Account and all associated data permanently deleted."}
