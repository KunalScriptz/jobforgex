"""Admin dashboard behaviour that needs a database (opt-in suite, see conftest.py).

Everything goes through the real HTTP routes with real JWTs, so a route that forgets its admin
guard, or a query that leaks job content, fails here.
"""
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest
import pytest_asyncio
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.config import settings
from app.services.auth import create_access_token
from app.tasks import admin_digest

pytestmark = pytest.mark.usefixtures("migrated_db")

SECRET_TITLE = "Top Secret Staff Engineer Role"


def _seed_user(session, tag: str, suffix: str, *, role: str, with_data: bool = False) -> SimpleNamespace:
    from app.models import AICostLog, Board, Job, User, UserRole, Workspace

    user = User(email=f"{tag}-{suffix}@example.test", password_hash="x", email_verified=True)
    session.add(user)
    session.flush()
    session.add(UserRole(user_id=user.id, role=role))
    ws = Workspace(owner_user_id=user.id, name=f"ws-{tag}")
    session.add(ws)
    session.flush()
    if with_data:
        board = Board(workspace_id=ws.id, name="b")
        session.add(board)
        session.flush()
        session.add(
            Job(workspace_id=ws.id, board_id=board.id, company="SecretCo", title=SECRET_TITLE,
                description="confidential description", status="applied")
        )
        session.add(
            AICostLog(workspace_id=ws.id, user_id=user.id, model_name="m", input_tokens=10, output_tokens=5,
                      total_tokens=15, input_cost=0, output_cost=0, total_cost=Decimal("1.5"), purpose="custom")
        )
        session.flush()
    token = create_access_token(str(user.id), user.email, role)
    return SimpleNamespace(
        id=str(user.id), email=user.email, ws_id=str(ws.id), headers={"Authorization": f"Bearer {token}"}
    )


@pytest.fixture
def world(migrated_db):
    suffix = uuid.uuid4().hex[:8]
    engine = create_engine(migrated_db)
    try:
        with Session(engine) as session:
            admin = _seed_user(session, "admin", suffix, role="admin")
            other_admin = _seed_user(session, "admin2", suffix, role="admin")
            member = _seed_user(session, "member", suffix, role="user", with_data=True)
            victim = _seed_user(session, "victim", suffix, role="user")
            session.commit()
    finally:
        engine.dispose()
    return SimpleNamespace(admin=admin, other_admin=other_admin, member=member, victim=victim, suffix=suffix)


@pytest_asyncio.fixture
async def open_signups(client, world):
    """Leave the instance in the default (open, no cap) state, whatever a test did."""
    yield
    await client.put(
        "/api/v1/admin/settings",
        headers=world.admin.headers,
        json={"signup_mode": "open", "clear_default_cap": True, "notify_daily_summary": True, "notify_signups": True},
    )


# --------------------------------------------------------------------------- access control
@pytest.mark.asyncio
async def test_a_plain_user_gets_403_even_with_a_forged_admin_claim(client, world):
    # The JWT says "admin" but the database says "user": the database wins.
    forged = create_access_token(world.member.id, world.member.email, "admin")
    res = await client.get("/api/v1/admin/overview", headers={"Authorization": f"Bearer {forged}"})
    assert res.status_code == 403
    res = await client.get("/api/v1/admin/users", headers=world.member.headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_role_in_the_database_is_enough_even_with_a_stale_user_claim(client, world):
    stale = create_access_token(world.admin.id, world.admin.email, "user")
    res = await client.get("/api/v1/admin/overview", headers={"Authorization": f"Bearer {stale}"})
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_admin_can_read_every_dashboard_route(client, world, monkeypatch):
    from app.routers import admin as admin_router

    monkeypatch.setattr(admin_router, "run_health_checks", lambda: [{"name": "x", "ok": True, "latency_ms": 1, "detail": None}])
    h = world.admin.headers
    overview = (await client.get("/api/v1/admin/overview?days=7", headers=h)).json()
    assert overview["totals"]["users"] >= 4
    assert len(overview["signups_by_day"]) == 7 and len(overview["ai_by_day"]) == 7
    assert overview["jobs_by_status"].get("applied", 0) >= 1
    for path in ("settings", "allowlist", "failures", "audit", "users"):
        res = await client.get(f"/api/v1/admin/{path}", headers=h)
        assert res.status_code == 200, path
    health = (await client.get("/api/v1/admin/health", headers=h)).json()
    assert health == {"ok": True, "checks": [{"name": "x", "ok": True, "latency_ms": 1, "detail": None}]}


@pytest.mark.asyncio
async def test_the_profile_tells_the_ui_who_is_an_admin(client, world):
    admin = (await client.get("/api/v1/users/me", headers=world.admin.headers)).json()
    member = (await client.get("/api/v1/users/me", headers=world.member.headers)).json()
    assert admin["is_admin"] is True and member["is_admin"] is False
    # a stale "admin" claim in the token doesn't make the profile say so
    forged = {"Authorization": f"Bearer {create_access_token(world.member.id, world.member.email, 'admin')}"}
    assert (await client.get("/api/v1/users/me", headers=forged)).json()["is_admin"] is False


@pytest.mark.asyncio
async def test_a_deleted_users_token_stops_working(client, world):
    res = await client.get("/api/v1/auth/me", headers=world.victim.headers)
    assert res.status_code == 200 and res.json()["role"] == "user"
    deleted = await client.request(
        "DELETE", f"/api/v1/admin/users/{world.victim.id}", headers=world.admin.headers,
        json={"confirm_email": world.victim.email},
    )
    assert deleted.status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=world.victim.headers)).status_code == 401


# --------------------------------------------------------------------------- privacy
@pytest.mark.asyncio
async def test_admin_views_never_contain_job_content(client, world):
    h = world.admin.headers
    blobs = [
        (await client.get(f"/api/v1/admin/{p}", headers=h)).text
        for p in ("users?page_size=100", "overview", "failures", "audit")
    ]
    for blob in blobs:
        assert SECRET_TITLE not in blob and "confidential description" not in blob and "SecretCo" not in blob
    users = (await client.get(f"/api/v1/admin/users?search=member-{world.suffix}", headers=h)).json()
    row = users["items"][0]
    assert row["jobs"] == 1 and row["ai_cost_this_month"] == 1.5


# --------------------------------------------------------------------------- deleting users
@pytest.mark.asyncio
async def test_delete_needs_the_matching_email_and_refuses_yourself(client, world):
    h = world.admin.headers
    wrong = await client.request("DELETE", f"/api/v1/admin/users/{world.victim.id}", headers=h, json={"confirm_email": "nope@x.test"})
    assert wrong.status_code == 400
    me = await client.request("DELETE", f"/api/v1/admin/users/{world.admin.id}", headers=h, json={"confirm_email": world.admin.email})
    assert me.status_code == 400
    missing = await client.request("DELETE", f"/api/v1/admin/users/{uuid.uuid4()}", headers=h, json={"confirm_email": "a@b.test"})
    assert missing.status_code == 404
    assert (await client.get("/api/v1/auth/me", headers=world.victim.headers)).status_code == 200


@pytest.mark.asyncio
async def test_the_last_admin_cannot_be_deleted(client, world, monkeypatch):
    from app.services import admin as admin_service

    async def one_admin(db):
        return 1

    monkeypatch.setattr(admin_service, "admin_count", one_admin)
    res = await client.request(
        "DELETE", f"/api/v1/admin/users/{world.other_admin.id}", headers=world.admin.headers,
        json={"confirm_email": world.other_admin.email},
    )
    assert res.status_code == 400 and "last admin" in res.json()["detail"]


@pytest.mark.asyncio
async def test_deleting_a_user_is_recorded_in_the_audit_log(client, world):
    await client.request(
        "DELETE", f"/api/v1/admin/users/{world.victim.id}", headers=world.admin.headers,
        json={"confirm_email": world.victim.email.upper()},  # confirmation is case-insensitive
    )
    audit = (await client.get("/api/v1/admin/audit", headers=world.admin.headers)).json()["items"]
    assert any(a["action"] == "delete_user" and a["target_email"] == world.victim.email for a in audit)


# --------------------------------------------------------------------------- signup control
async def _register(client, email):
    return await client.post("/api/v1/auth/register", json={"email": email, "password": "Passw0rd!123"})


@pytest.mark.asyncio
async def test_signup_modes_through_the_register_route(client, world, open_signups):
    h = world.admin.headers
    a, b, c = (f"{n}-{world.suffix}@example.com" for n in ("closed", "invited", "open"))

    assert (await client.put("/api/v1/admin/settings", headers=h, json={"signup_mode": "closed"})).status_code == 200
    assert (await _register(client, a)).status_code == 403

    await client.put("/api/v1/admin/settings", headers=h, json={"signup_mode": "invite"})
    assert (await _register(client, b)).status_code == 403
    assert (await client.post("/api/v1/admin/allowlist", headers=h, json={"email": b.upper()})).status_code == 201
    assert (await _register(client, b)).status_code == 200

    await client.put("/api/v1/admin/settings", headers=h, json={"signup_mode": "open"})
    assert (await _register(client, c)).status_code == 200


@pytest.mark.asyncio
async def test_closed_mode_does_not_lock_out_existing_users(client, world, open_signups):
    await client.put("/api/v1/admin/settings", headers=world.admin.headers, json={"signup_mode": "closed"})
    assert (await client.get("/api/v1/auth/me", headers=world.member.headers)).status_code == 200


@pytest.mark.asyncio
async def test_settings_validate_their_input(client, world):
    res = await client.put("/api/v1/admin/settings", headers=world.admin.headers, json={"signup_mode": "everyone"})
    assert res.status_code == 422
    res = await client.delete("/api/v1/admin/allowlist/nobody@example.test", headers=world.admin.headers)
    assert res.status_code == 404


# --------------------------------------------------------------------------- google callback
@pytest.fixture
def admin_alerts(monkeypatch):
    """Capture admin alert emails instead of sending them."""
    from app.routers import auth as auth_router

    sent = []
    monkeypatch.setattr(auth_router, "notify_admins_background", lambda tpl, **kw: sent.append((tpl, kw)) or 1)
    monkeypatch.setattr(auth_router, "_send_email_background", lambda *a, **kw: None)  # the user's welcome mail
    return sent


@pytest.mark.asyncio
async def test_a_blocked_google_signup_redirects_back_to_the_app_and_alerts_the_admin(client, world, monkeypatch, admin_alerts, open_signups):
    from app.routers import auth as auth_router
    from app.services import auth as auth_service
    from app.services.instance_settings import SignupBlockedError

    async def blocked(db, code):
        raise SignupBlockedError("<i>stranger</i>@example.com", "not_invited")

    monkeypatch.setattr(auth_service, "google_auth_user", blocked)
    monkeypatch.setattr(auth_router.ratelimit, "allow", lambda *a, **kw: _true())
    res = await client.get("/api/v1/auth/google/callback?code=x", follow_redirects=False)
    assert res.status_code in (302, 307)
    assert res.headers["location"] == f"{settings.FRONTEND_URL}/auth?error=not_invited"
    (template, kwargs), = admin_alerts
    assert template == "admin_signup_blocked"
    assert "<i>" not in kwargs["email"] and "&lt;i&gt;" in kwargs["email"]  # escaped before it reaches HTML
    assert kwargs["admin_url"].endswith("/admin?tab=access")


async def _true():
    return True


@pytest.mark.asyncio
async def test_a_new_google_signup_alerts_the_admin_unless_switched_off(client, world, monkeypatch, admin_alerts, open_signups):
    from app.services import auth as auth_service

    async def new_user(db, code):
        return {"access_token": "a", "refresh_token": "r", "is_new": True,
                "user": {"email": f"fresh-{world.suffix}@example.com", "full_name": "Fresh <b>Face</b>"}}

    monkeypatch.setattr(auth_service, "google_auth_user", new_user)
    res = await client.get("/api/v1/auth/google/callback?code=x", follow_redirects=False)
    assert "new_user=1" in res.headers["location"]
    (template, kwargs), = admin_alerts
    assert template == "admin_new_signup" and kwargs["total_users"] >= 1
    assert "<b>" not in kwargs["name"]

    admin_alerts.clear()
    await client.put("/api/v1/admin/settings", headers=world.admin.headers, json={"notify_signups": False})
    await client.get("/api/v1/auth/google/callback?code=x", follow_redirects=False)
    assert admin_alerts == []


# --------------------------------------------------------------------------- AI caps
@pytest.mark.asyncio
async def test_a_user_over_their_cap_is_refused_before_any_ai_call(client, world, open_signups):
    h = world.admin.headers
    # member already has $1.50 of spend. The `client` fixture makes call_deepseek raise if reached.
    assert (await client.put(f"/api/v1/admin/users/{world.member.id}/ai-cap", headers=h, json={"cap_usd": 1.0})).status_code == 200
    res = await client.post(
        "/api/v1/ai/generate", headers=world.member.headers,
        json={"prompt_name": "extract_insights", "vars": {"jd": "x"}, "purpose": "custom"},
    )
    assert res.status_code == 429 and "limit" in res.json()["detail"].lower()
    ent = (await client.get("/api/v1/ai/entitlement", headers=world.member.headers)).json()
    assert ent == {"allowed": False, "reason": "ai_budget"}


@pytest.mark.asyncio
async def test_cap_precedence_and_admin_exemption(client, world, open_signups, migrated_db):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.services import ai as ai_service

    h = world.admin.headers
    engine = create_async_engine(migrated_db.replace("postgresql+psycopg2", "postgresql+asyncpg", 1), poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async def over(role="user"):
            async with factory() as db:
                try:
                    await ai_service.check_ai_budget(db, world.member.ws_id, role)
                    return False
                except ai_service.AIBudgetExceeded:
                    return True

        assert await over() is False  # no cap anywhere: unlimited
        await client.put("/api/v1/admin/settings", headers=h, json={"default_ai_monthly_cap_usd": 1.0})
        assert await over() is True  # instance default applies
        assert await over("admin") is False  # admins are exempt
        await client.put(f"/api/v1/admin/users/{world.member.id}/ai-cap", headers=h, json={"cap_usd": 5.0})
        assert await over() is False  # per-user override beats the default
        await client.put(f"/api/v1/admin/users/{world.member.id}/ai-cap", headers=h, json={"cap_usd": None})
        assert await over() is True  # clearing the override falls back to the default
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_failed_ai_calls_show_up_in_the_failure_log(client, world, migrated_db, monkeypatch):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    import app.database
    from app.services import ai as ai_service

    engine = create_async_engine(migrated_db.replace("postgresql+psycopg2", "postgresql+asyncpg", 1), poolclass=NullPool)
    monkeypatch.setattr(app.database, "async_session_factory", async_sessionmaker(engine, expire_on_commit=False))
    try:
        await ai_service.record_ai_failure(world.member.ws_id, world.member.id, "resume_tailoring", RuntimeError("AI provider error 503: down"))
    finally:
        await engine.dispose()
    failures = (await client.get("/api/v1/admin/failures", headers=world.admin.headers)).json()
    mine = [f for f in failures["ai"] if f["email"] == world.member.email]
    assert mine and mine[0]["kind"] == "provider_error" and mine[0]["purpose"] == "resume_tailoring"


# --------------------------------------------------------------------------- daily summary
@pytest.fixture
def summary_mail(monkeypatch):
    sent = []
    claims = set()

    async def fake_send_email(to, template_name, **kwargs):
        sent.append(SimpleNamespace(to=to, template=template_name, **kwargs))
        return True

    def claim_once(key, ttl_s):
        if key in claims:
            return False
        claims.add(key)
        return True

    monkeypatch.setattr(settings, "SMTP_USER", "u")
    monkeypatch.setattr(settings, "SMTP_PASS", "p")
    monkeypatch.setattr(admin_digest, "send_email", fake_send_email)
    monkeypatch.setattr(admin_digest, "run_health_checks", lambda: [])
    monkeypatch.setattr(admin_digest.ratelimit, "claim_once", claim_once)
    monkeypatch.setattr(admin_digest.ratelimit, "release_claim", lambda key: claims.discard(key))
    return sent


@pytest.mark.asyncio
async def test_summary_goes_only_to_admin_emails_once_a_day_without_job_content(client, world, summary_mail, monkeypatch, open_signups):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", f"{world.admin.email},{world.other_admin.email}")
    # run() is sync and blocks; it opens its own sync engine against the same test database.
    import asyncio

    first = await asyncio.to_thread(admin_digest.send_admin_summary.run)
    assert first["sent"] == 2
    assert sorted(m.to for m in summary_mail) == sorted([world.admin.email, world.other_admin.email])
    assert all(m.template == "admin_daily_summary" for m in summary_mail)
    body = summary_mail[0].body_html
    assert world.member.email in body  # member was seeded with AI spend, but no login: appears via activity only if in window
    assert SECRET_TITLE not in body and "confidential description" not in body and "SecretCo" not in body

    assert (await asyncio.to_thread(admin_digest.send_admin_summary.run))["error"] == "duplicate"
    assert (await asyncio.to_thread(admin_digest.send_admin_summary.run, True))["sent"] == 2  # force ignores the guard

    summary_mail.clear()
    await client.put("/api/v1/admin/settings", headers=world.admin.headers, json={"notify_daily_summary": False})
    assert (await asyncio.to_thread(admin_digest.send_admin_summary.run))["error"] == "disabled"
    assert summary_mail == []


@pytest.mark.asyncio
async def test_summary_does_nothing_without_admins(summary_mail, monkeypatch):
    import asyncio

    monkeypatch.setattr(settings, "ADMIN_EMAILS", "")
    assert (await asyncio.to_thread(admin_digest.send_admin_summary.run))["error"] == "no_admins"
    assert summary_mail == []


def test_the_admin_tables_exist(migrated_db):
    engine = create_engine(migrated_db)
    try:
        with engine.connect() as conn:
            for table in ("instance_settings", "signup_allowlist", "ai_failure_log", "admin_audit_log"):
                assert conn.execute(text("SELECT to_regclass(:t)"), {"t": table}).scalar() is not None, table
    finally:
        engine.dispose()
