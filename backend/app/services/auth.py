import bcrypt
import uuid
import hashlib
import httpx
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError

from app.config import settings
from app.models.user import User, RefreshToken, VerificationToken, PasswordResetToken
from app.models.user_role import UserRole
from app.models.workspace import Workspace
from app.models.subscription import Subscription


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_access_token(user_id: str, email: str, role: str, workspace_id: str | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    claims = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": expire,
    }
    if workspace_id:
        claims["workspace_id"] = workspace_id
    return jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token() -> tuple[str, str, datetime]:
    token = str(uuid.uuid4())
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return token, token_hash, expires_at


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


async def register_user(db: AsyncSession, email: str, password: str, full_name: str | None = None) -> dict:
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise ValueError("A user with this email already exists")

    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
    )
    db.add(user)
    await db.flush()

    user_role = UserRole(user_id=user.id, role="user")
    db.add(user_role)

    subscription = Subscription(
        user_id=user.id,
        plan="free",
        plan_id="free",
        subscription_status="active",
    )
    db.add(subscription)

    await db.flush()
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": "user",
    }


async def login_user(db: AsyncSession, email: str, password: str) -> dict:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("Invalid email or password")
    if not user.password_hash:
        raise ValueError("This account was created with Google Sign-In. Please sign in with Google, or use 'Forgot password' to set a password.")
    if not verify_password(password, user.password_hash):
        raise ValueError("Invalid email or password")

    role_result = await db.execute(select(UserRole).where(UserRole.user_id == user.id))
    user_role = role_result.scalar_one_or_none()
    role = user_role.role if user_role else "user"

    ws_result = await db.execute(select(Workspace).where(Workspace.owner_user_id == user.id).limit(1))
    workspace = ws_result.scalar_one_or_none()
    workspace_id = str(workspace.id) if workspace else None
    workspace_name = workspace.name if workspace else None

    access_token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        role=role,
        workspace_id=workspace_id,
    )

    raw_token, token_hash, expires_at = create_refresh_token()
    rt = RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at)
    db.add(rt)
    await db.flush()

    return {
        "access_token": access_token,
        "refresh_token": raw_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "email_verified": user.email_verified,
            "role": role,
            "workspace_id": workspace_id,
            "workspace_name": workspace_name,
            "created_at": user.created_at,
        },
    }


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> dict:
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    rt = result.scalar_one_or_none()
    if not rt:
        raise ValueError("Invalid or expired refresh token")

    await db.delete(rt)

    user_result = await db.execute(select(User).where(User.id == rt.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found")

    role_result = await db.execute(select(UserRole).where(UserRole.user_id == user.id))
    user_role = role_result.scalar_one_or_none()
    role = user_role.role if user_role else "user"

    ws_result = await db.execute(select(Workspace).where(Workspace.owner_user_id == user.id).limit(1))
    workspace = ws_result.scalar_one_or_none()

    access_token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        role=role,
        workspace_id=str(workspace.id) if workspace else None,
    )

    new_raw, new_hash, expires_at = create_refresh_token()
    new_rt = RefreshToken(user_id=user.id, token_hash=new_hash, expires_at=expires_at)
    db.add(new_rt)
    await db.flush()

    return {"access_token": access_token, "refresh_token": new_raw, "token_type": "bearer"}


async def revoke_refresh_token(db: AsyncSession, refresh_token: str) -> None:
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    rt = result.scalar_one_or_none()
    if rt:
        await db.delete(rt)
        await db.flush()


async def create_email_verification_token(db: AsyncSession, user_id: uuid.UUID) -> str:
    token = str(uuid.uuid4())
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    vt = VerificationToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    db.add(vt)
    await db.flush()
    return token


async def verify_email(db: AsyncSession, token: str) -> bool:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    result = await db.execute(
        select(VerificationToken)
        .where(VerificationToken.token_hash == token_hash)
        .where(VerificationToken.used == False)
        .where(VerificationToken.expires_at > datetime.now(timezone.utc))
    )
    vt = result.scalar_one_or_none()
    if not vt:
        return False

    vt.used = True
    user_result = await db.execute(select(User).where(User.id == vt.user_id))
    user = user_result.scalar_one_or_none()
    if user:
        user.email_verified = True
        user.verified_at = datetime.now(timezone.utc)
    await db.flush()
    return True


async def create_password_reset_token(db: AsyncSession, email: str) -> str | None:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return None

    token = str(uuid.uuid4())
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    prt = PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at)
    db.add(prt)
    await db.flush()
    return token


async def reset_password(db: AsyncSession, token: str, new_password: str) -> bool:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    result = await db.execute(
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == token_hash)
        .where(PasswordResetToken.used == False)
        .where(PasswordResetToken.expires_at > datetime.now(timezone.utc))
    )
    prt = result.scalar_one_or_none()
    if not prt:
        return False

    prt.used = True
    user_result = await db.execute(select(User).where(User.id == prt.user_id))
    user = user_result.scalar_one_or_none()
    if user:
        user.password_hash = hash_password(new_password)
    await db.flush()
    return True


async def google_auth_user(db: AsyncSession, code: str) -> dict:
    client_id = settings.GOOGLE_CLIENT_ID
    client_secret = settings.GOOGLE_CLIENT_SECRET
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    if not client_id or not client_secret:
        raise ValueError("Google OAuth is not configured")

    async with httpx.AsyncClient(timeout=30) as http:
        token_resp = await http.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise ValueError(f"Google token exchange failed: {token_resp.text[:300]}")
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError("No access token from Google")

        user_resp = await http.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            raise ValueError(f"Google userinfo failed: {user_resp.text[:300]}")
        user_info = user_resp.json()
        google_id = user_info.get("sub")
        email = user_info.get("email")
        name = user_info.get("name")
        picture = user_info.get("picture")
        email_verified = user_info.get("email_verified", False)

        if not google_id or not email:
            raise ValueError("Google did not provide required user info")

    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()
    is_new = False

    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.google_id = google_id
            user.avatar_url = picture
            if not user.full_name and name:
                user.full_name = name
            if email_verified and not user.email_verified:
                user.email_verified = True
                user.verified_at = datetime.now(timezone.utc)
            await db.flush()
        else:
            user = User(
                email=email,
                password_hash="",
                full_name=name,
                google_id=google_id,
                avatar_url=picture,
                email_verified=email_verified,
                verified_at=datetime.now(timezone.utc) if email_verified else None,
            )
            db.add(user)
            await db.flush()

            user_role = UserRole(user_id=user.id, role="user")
            db.add(user_role)

            subscription = Subscription(
                user_id=user.id,
                plan="free",
                plan_id="free",
                subscription_status="active",
            )
            db.add(subscription)
            await db.flush()
            is_new = True

    role_result = await db.execute(select(UserRole).where(UserRole.user_id == user.id))
    user_role = role_result.scalar_one_or_none()
    role = user_role.role if user_role else "user"

    ws_result = await db.execute(select(Workspace).where(Workspace.owner_user_id == user.id).limit(1))
    workspace = ws_result.scalar_one_or_none()
    workspace_id = str(workspace.id) if workspace else None

    access_token_jwt = create_access_token(
        user_id=str(user.id),
        email=user.email,
        role=role,
        workspace_id=workspace_id,
    )

    raw_token, token_hash, expires_at = create_refresh_token()
    rt = RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at)
    db.add(rt)
    await db.flush()

    return {
        "access_token": access_token_jwt,
        "refresh_token": raw_token,
        "token_type": "bearer",
        "is_new": is_new,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "email_verified": user.email_verified,
            "role": role,
            "workspace_id": workspace_id,
            "workspace_name": workspace.name if workspace else None,
            "created_at": user.created_at,
        },
    }
