"""Instance-wide admin settings (signup mode, default AI cap, notification toggles) and the
signup allowlist. Stored in `instance_settings` as strings; this module owns the parsing.

Async functions are for request handlers; the `_sync` ones are for Celery tasks, which use a
sync Session.
"""
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.config import settings
from app.models.admin import InstanceSetting, SignupAllowlist

SIGNUP_MODES = ("open", "invite", "closed")

DEFAULTS = {
    "signup_mode": "open",
    # Empty string = no instance-wide cap.
    "default_ai_monthly_cap_usd": "",
    "notify_signups": "true",
    "notify_daily_summary": "true",
}


class SignupBlockedError(ValueError):
    """A new account was refused by the signup policy. Subclasses ValueError so callers that only
    know about ValueError still turn it into a 400."""

    def __init__(self, email: str, reason: str):
        self.email = email
        self.reason = reason  # "closed" | "not_invited"
        super().__init__(
            "Signups are closed on this instance." if reason == "closed"
            else "This instance is invite-only. Ask the admin to add your email."
        )


def _to_bool(value: str) -> bool:
    return value.strip().lower() in ("1", "true", "yes", "on")


def _to_cap(value: str) -> Decimal | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        cap = Decimal(value)
    except InvalidOperation:
        return None
    return cap if cap >= 0 else None


def _parse(rows: dict[str, str]) -> dict:
    merged = {**DEFAULTS, **rows}
    mode = merged["signup_mode"] if merged["signup_mode"] in SIGNUP_MODES else DEFAULTS["signup_mode"]
    return {
        "signup_mode": mode,
        "default_ai_monthly_cap_usd": _to_cap(merged["default_ai_monthly_cap_usd"]),
        "notify_signups": _to_bool(merged["notify_signups"]),
        "notify_daily_summary": _to_bool(merged["notify_daily_summary"]),
    }


async def get_all(db: AsyncSession) -> dict:
    result = await db.execute(select(InstanceSetting))
    return _parse({r.key: r.value for r in result.scalars().all()})


def get_all_sync(session: Session) -> dict:
    return _parse({r.key: r.value for r in session.query(InstanceSetting).all()})


async def set_value(db: AsyncSession, key: str, value: str) -> None:
    if key not in DEFAULTS:
        raise ValueError(f"Unknown setting: {key}")
    row = await db.get(InstanceSetting, key)
    if row:
        row.value = value
    else:
        db.add(InstanceSetting(key=key, value=value))
    await db.flush()


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def check_signup_allowed(db: AsyncSession, email: str) -> None:
    """Raise SignupBlockedError if the signup policy refuses a NEW account for `email`.

    Only call this when creating a user; existing users are never blocked by it. Admin emails
    always pass, so the operator cannot lock themselves out of their own instance.
    """
    email_n = normalize_email(email)
    if email_n in settings.admin_emails:
        return
    mode = (await get_all(db))["signup_mode"]
    if mode == "open":
        return
    if mode == "closed":
        raise SignupBlockedError(email, "closed")
    row = await db.get(SignupAllowlist, email_n)
    if row is None:
        raise SignupBlockedError(email, "not_invited")
