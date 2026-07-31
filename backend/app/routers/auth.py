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
from app.services.email import send_email
from app.config import settings
from app.models.user import User
from app.models.workspace import Workspace

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _send_email_background(to: str, template_name: str, **kwargs):
    """Send email in a background thread so it never blocks the response."""
    import threading
    def _run():
        import asyncio as _asyncio
        loop = _asyncio.new_event_loop()
        _asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(send_email(to, template_name, **kwargs))
        finally:
            loop.close()
    threading.Thread(target=_run, daemon=True).start()


@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    try:
        user_data = await auth_service.register_user(db, data.email, data.password, data.full_name)
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
        frontend_url = settings.CORS_ORIGINS.split(",")[0].strip()
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
async def me(user: dict = Depends(auth_service.decode_access_token)):
    return {"user_id": user.get("sub"), "email": user.get("email"), "role": user.get("role")}


@router.get("/google/login")
async def google_login():
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Google OAuth not configured")
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url=auth_url)


@router.get("/google/callback")
async def google_callback(code: str = Query(...), db: AsyncSession = Depends(get_db)):
    try:
        result = await auth_service.google_auth_user(db, code)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    auth_url = settings.CORS_ORIGINS.split(",")[0].strip()
    params = [
        f"token={result['access_token']}",
        f"refresh_token={result['refresh_token']}",
    ]
    if result.get("is_new"):
        params.append("new_user=1")
        frontend_url = settings.CORS_ORIGINS.split(",")[0].strip()
        _send_email_background(result["user"]["email"], "welcome", frontend_url=frontend_url)
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

    frontend_url = settings.CORS_ORIGINS.split(",")[0].strip()
    _send_email_background(user_email, "account_deleted", frontend_url=frontend_url)

    return {"ok": True, "message": "Account and all associated data permanently deleted."}
