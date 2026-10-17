"""Admin dashboard behaviour that needs no database."""
from datetime import datetime, timezone
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import email as email_service
from app.services import instance_settings
from app.services.ai import classify_ai_error
from app.tasks.admin_digest import build_admin_summary_html


def _admin_operations():
    for path, ops in app.openapi()["paths"].items():
        if path.startswith("/api/v1/admin"):
            for method in ops:
                yield method.upper(), path


def test_admin_router_exists_and_is_nontrivial():
    assert len(list(_admin_operations())) >= 12


@pytest.mark.parametrize("method,path", sorted(_admin_operations()))
def test_every_admin_route_rejects_anonymous_requests(method, path):
    path = path.replace("{user_id}", "00000000-0000-0000-0000-000000000000").replace("{email}", "a@b.test")
    res = TestClient(app).request(method, path)
    assert res.status_code == 401, f"{method} {path} -> {res.status_code}"


# --------------------------------------------------------------------------- settings parsing
def test_settings_defaults_and_parsing():
    parsed = instance_settings._parse({})
    assert parsed == {
        "signup_mode": "open",
        "default_ai_monthly_cap_usd": None,
        "notify_signups": True,
        "notify_daily_summary": True,
    }
    parsed = instance_settings._parse(
        {"signup_mode": "invite", "default_ai_monthly_cap_usd": "2.50", "notify_signups": "false"}
    )
    assert parsed["signup_mode"] == "invite"
    assert str(parsed["default_ai_monthly_cap_usd"]) == "2.50"
    assert parsed["notify_signups"] is False


@pytest.mark.parametrize("raw", ["garbage", "-1", ""])
def test_a_bad_cap_means_no_cap(raw):
    assert instance_settings._parse({"default_ai_monthly_cap_usd": raw})["default_ai_monthly_cap_usd"] is None


def test_an_unknown_signup_mode_falls_back_to_open():
    assert instance_settings._parse({"signup_mode": "whatever"})["signup_mode"] == "open"


def test_admin_emails_are_parsed_case_insensitively(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", " Boss@Example.test , ,second@example.test")
    assert settings.admin_emails == ["boss@example.test", "second@example.test"]
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "")
    assert settings.admin_emails == []


# --------------------------------------------------------------------------- signup policy
class _FakeDB:
    def __init__(self, allowlisted=()):
        self.allowlisted = set(allowlisted)

    async def get(self, model, key):
        return object() if key in self.allowlisted else None


@pytest.fixture
def mode(monkeypatch):
    async def set_mode(value):
        async def fake_get_all(db):
            return {"signup_mode": value}

        monkeypatch.setattr(instance_settings, "get_all", fake_get_all)

    return set_mode


@pytest.mark.asyncio
async def test_open_mode_lets_anyone_sign_up(mode):
    await mode("open")
    await instance_settings.check_signup_allowed(_FakeDB(), "anyone@example.test")


@pytest.mark.asyncio
async def test_closed_mode_blocks_everyone_except_admins(mode, monkeypatch):
    await mode("closed")
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "boss@example.test")
    with pytest.raises(instance_settings.SignupBlockedError) as exc:
        await instance_settings.check_signup_allowed(_FakeDB(allowlisted={"x@example.test"}), "x@example.test")
    assert exc.value.reason == "closed"
    await instance_settings.check_signup_allowed(_FakeDB(), "Boss@Example.test")


@pytest.mark.asyncio
async def test_invite_mode_needs_the_allowlist(mode):
    await mode("invite")
    db = _FakeDB(allowlisted={"friend@example.test"})
    await instance_settings.check_signup_allowed(db, "Friend@Example.test")
    with pytest.raises(instance_settings.SignupBlockedError) as exc:
        await instance_settings.check_signup_allowed(db, "stranger@example.test")
    assert exc.value.reason == "not_invited"
    assert isinstance(exc.value, ValueError)  # old callers that catch ValueError still work


# --------------------------------------------------------------------------- role resolution
class _RoleDB:
    """Just enough AsyncSession for resolve_role: one UserRole row, or none."""

    def __init__(self, role=None):
        self.row = SimpleNamespace(role=role) if role else None
        self.added = []

    async def execute(self, _stmt):
        row = self.row
        return SimpleNamespace(scalar_one_or_none=lambda: row)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        pass


def _user(email, verified=True):
    return SimpleNamespace(id="u1", email=email, email_verified=verified)


@pytest.mark.asyncio
async def test_listed_verified_email_becomes_admin(monkeypatch):
    from app.services.auth import resolve_role

    monkeypatch.setattr(settings, "ADMIN_EMAILS", "boss@example.test")
    db = _RoleDB(role="user")
    assert await resolve_role(db, _user("Boss@Example.test")) == "admin"
    assert db.row.role == "admin"


@pytest.mark.asyncio
async def test_unverified_email_is_never_promoted(monkeypatch):
    from app.services.auth import resolve_role

    monkeypatch.setattr(settings, "ADMIN_EMAILS", "boss@example.test")
    db = _RoleDB(role="user")
    assert await resolve_role(db, _user("boss@example.test", verified=False)) == "user"
    assert db.row.role == "user"


@pytest.mark.asyncio
async def test_removing_an_email_from_the_env_demotes_it(monkeypatch):
    from app.services.auth import resolve_role

    monkeypatch.setattr(settings, "ADMIN_EMAILS", "")
    db = _RoleDB(role="admin")
    assert await resolve_role(db, _user("boss@example.test")) == "user"
    assert db.row.role == "user"


@pytest.mark.asyncio
async def test_a_missing_role_row_is_created(monkeypatch):
    from app.services.auth import resolve_role

    monkeypatch.setattr(settings, "ADMIN_EMAILS", "")
    db = _RoleDB(role=None)
    assert await resolve_role(db, _user("someone@example.test")) == "user"
    assert [r.role for r in db.added] == ["user"]


# --------------------------------------------------------------------------- AI failure buckets
@pytest.mark.parametrize(
    "exc,kind",
    [
        (httpx.ReadTimeout("slow"), "timeout"),
        (httpx.ConnectError("no route"), "connection"),
        (RuntimeError("DeepSeek API key not configured"), "not_configured"),
        (RuntimeError("AI generation was cut off twice"), "truncated"),
        (RuntimeError("AI provider error 429: slow down"), "rate_limited"),
        (RuntimeError("AI provider error 401: bad key"), "auth"),
        (RuntimeError("AI provider error 503: down"), "provider_error"),
        (ValueError("something else"), "error"),
    ],
)
def test_ai_errors_are_bucketed(exc, kind):
    assert classify_ai_error(exc) == kind


# --------------------------------------------------------------------------- notifications
@pytest.fixture
def sent_emails(monkeypatch):
    sent = []
    monkeypatch.setattr(email_service, "send_email_background", lambda to, tpl, **kw: sent.append((to, tpl)))
    return sent


def test_admin_notifications_go_only_to_admin_emails(monkeypatch, sent_emails):
    monkeypatch.setattr(settings, "SMTP_USER", "u")
    monkeypatch.setattr(settings, "SMTP_PASS", "p")
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "Boss@example.test,second@example.test")
    n = email_service.notify_admins_background("admin_new_signup", email="new@example.test")
    assert n == 2
    assert sorted(to for to, _ in sent_emails) == ["boss@example.test", "second@example.test"]


def test_admin_notifications_do_nothing_without_smtp_or_admins(monkeypatch, sent_emails):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "boss@example.test")
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_PASS", "")
    assert email_service.notify_admins_background("admin_new_signup") == 0
    monkeypatch.setattr(settings, "SMTP_USER", "u")
    monkeypatch.setattr(settings, "SMTP_PASS", "p")
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "")
    assert email_service.notify_admins_background("admin_new_signup") == 0
    assert sent_emails == []


def _stats(**over):
    base = {
        "total_users": 3,
        "new_signups": [{"email": "<b>new</b>@example.test", "at": datetime(2026, 10, 17, 9, 5, tzinfo=timezone.utc)}],
        "active": [
            {"email": "a@example.test", "jobs_added": 2, "applied": 1, "docs": 1, "ai_calls": 4,
             "ai_cost": 0.12, "month_cost": 1.5, "cap": 1.0},
        ],
        "ai_failures": 2,
        "latex_failures": 1,
    }
    return {**base, **over}


def test_summary_escapes_user_controlled_text_and_flags_over_cap():
    body = build_admin_summary_html(_stats(), [], "https://app.example.test/admin")
    assert "<b>new</b>" not in body and "&lt;b&gt;new&lt;/b&gt;@example.test" in body
    assert "color:#b91c1c" in body  # a@example.test is over its $1.00 cap
    assert "2 AI, 1 LaTeX" in body


def test_summary_shows_a_banner_only_when_a_check_fails():
    ok = [{"name": "Redis", "ok": True, "latency_ms": 1, "detail": None}]
    bad = [{"name": "LaTeX server", "ok": False, "latency_ms": 3, "detail": "HTTP 502"}]
    assert "Needs attention" not in build_admin_summary_html(_stats(), ok, "https://x.test/admin")
    banner = build_admin_summary_html(_stats(), bad, "https://x.test/admin")
    assert "Needs attention" in banner and "LaTeX server" in banner and "HTTP 502" in banner


def test_summary_handles_a_quiet_day():
    body = build_admin_summary_html(_stats(new_signups=[], active=[]), [], "https://x.test/admin")
    assert "Nobody was active." in body
    assert "None" in body
