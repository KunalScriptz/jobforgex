"""Digest behaviour that needs a database (opt-in suite, see conftest.py)."""
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import settings
from app.services import auth
from app.tasks import digest

pytestmark = pytest.mark.usefixtures("migrated_db")


def _make_user(session, tag: str, suffix: str, *, digest_enabled: bool = True) -> SimpleNamespace:
    from app.models import User, Workspace

    user = User(email=f"digest-{tag}-{suffix}@example.test", password_hash="x", digest_enabled=digest_enabled)
    session.add(user)
    session.flush()
    ws = Workspace(owner_user_id=user.id, name=f"ws-{tag}")
    session.add(ws)
    session.flush()
    token = auth.create_access_token(str(user.id), user.email, "user")
    return SimpleNamespace(
        id=str(user.id), email=user.email, ws_id=str(ws.id), headers={"Authorization": f"Bearer {token}"}
    )


@pytest.fixture
def users(migrated_db):
    suffix = uuid.uuid4().hex[:8]
    engine = create_engine(migrated_db)
    try:
        with Session(engine) as session:
            on = _make_user(session, "on", suffix)
            off = _make_user(session, "off", suffix, digest_enabled=False)
            session.commit()
    finally:
        engine.dispose()
    return on, off


@pytest.fixture
def claims(monkeypatch):
    """In-memory stand-in for the Redis once-per-slot claims."""
    store: set[str] = set()

    def claim_once(key, ttl_s):
        if key in store:
            return False
        store.add(key)
        return True

    monkeypatch.setattr(digest.ratelimit, "claim_once", claim_once)
    monkeypatch.setattr(digest.ratelimit, "release_claim", lambda key: store.discard(key))
    return store


@pytest.fixture
def mail(monkeypatch, claims):
    """Capture outgoing digests instead of using SMTP. `mail.ok = False` simulates an SMTP failure."""
    state = SimpleNamespace(sent=[], ok=True)

    async def fake_send_email(to, template_name, **kwargs):
        assert template_name == "digest"
        if state.ok:
            state.sent.append(to)
        return state.ok

    monkeypatch.setattr(settings, "SMTP_USER", "smtp-user")
    monkeypatch.setattr(settings, "SMTP_PASS", "smtp-pass")
    monkeypatch.setattr(digest, "send_email", fake_send_email)
    return state


# --------------------------------------------------------------------------- the scheduled task
def test_scheduled_digest_skips_opted_out_users_and_never_double_sends(users, mail):
    on, off = users

    first = digest.send_daily_digest.run()
    assert on.email in mail.sent
    assert off.email not in mail.sent
    assert first["skipped_opt_out"] >= 1

    mail.sent.clear()
    second = digest.send_daily_digest.run()  # same half-day slot, e.g. a redelivered task
    assert on.email not in mail.sent
    assert second["skipped_duplicate"] >= 1


def test_a_failed_send_releases_the_claim_so_a_retry_can_succeed(users, mail, claims):
    on, _ = users

    mail.ok = False
    failed = digest.send_daily_digest.run()
    assert failed["failed"] >= 1
    assert not any(c.startswith(f"digest:{on.ws_id}:") for c in claims)

    mail.ok = True
    retried = digest.send_daily_digest.run()
    assert on.email in mail.sent
    assert retried["sent"] >= 1


def test_explicit_test_digest_ignores_the_opt_out(users, mail):
    _, off = users
    assert digest.send_digest_for_user.run(off.id) == {"sent": True}
    assert off.email in mail.sent


# --------------------------------------------------------------------------- HTTP
@pytest.mark.asyncio
async def test_unsubscribe_link_works_without_logging_in(client, users):
    on, _ = users
    token = auth.create_digest_unsubscribe_token(on.id)

    for _ in range(2):  # idempotent
        r = await client.post("/api/v1/users/digest/unsubscribe", json={"token": token})
        assert r.status_code == 200 and r.json() == {"ok": True}
    me = await client.get("/api/v1/users/me", headers=on.headers)
    assert me.json()["digest_enabled"] is False


@pytest.mark.asyncio
async def test_unsubscribe_rejects_bad_tokens_and_login_tokens(client, users):
    on, _ = users
    access_token = on.headers["Authorization"].split(" ", 1)[1]
    for token in ("garbage", access_token):
        r = await client.post("/api/v1/users/digest/unsubscribe", json={"token": token})
        assert r.status_code == 400
    me = await client.get("/api/v1/users/me", headers=on.headers)
    assert me.json()["digest_enabled"] is True


@pytest.mark.asyncio
async def test_digest_preference_can_be_toggled_in_settings(client, users):
    on, _ = users
    r = await client.patch("/api/v1/users/me", headers=on.headers, json={"digest_enabled": False})
    assert r.status_code == 200 and r.json()["digest_enabled"] is False
    assert (await client.patch("/api/v1/users/me", headers=on.headers, json={"digest_enabled": None})).status_code == 422
    r = await client.patch("/api/v1/users/me", headers=on.headers, json={"digest_enabled": True})
    assert r.json()["digest_enabled"] is True


@pytest.mark.asyncio
async def test_test_digest_endpoint_queues_a_task_for_the_caller_only(client, users, monkeypatch):
    on, _ = users
    queued: list[str] = []
    monkeypatch.setattr(digest.send_digest_for_user, "delay", lambda uid: queued.append(uid))

    async def allow_all(key, limit, window_s):
        return True

    monkeypatch.setattr("app.routers.users.ratelimit.allow", allow_all)

    assert (await client.post("/api/v1/users/me/digest/test")).status_code == 401
    r = await client.post("/api/v1/users/me/digest/test", headers=on.headers)
    assert r.status_code == 202 and r.json() == {"queued": True}
    assert queued == [on.id]


@pytest.mark.asyncio
async def test_test_digest_endpoint_is_rate_limited(client, users, monkeypatch):
    on, _ = users
    monkeypatch.setattr(digest.send_digest_for_user, "delay", lambda uid: pytest.fail("must not queue"))

    async def deny(key, limit, window_s):
        return False

    monkeypatch.setattr("app.routers.users.ratelimit.allow", deny)
    r = await client.post("/api/v1/users/me/digest/test", headers=on.headers)
    assert r.status_code == 429
