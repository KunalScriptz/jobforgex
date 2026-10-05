"""Daily digest: pure logic, the unsubscribe token, and the task's early exits. No database."""
from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from app.config import settings
from app.schemas.user import UserProfileUpdate
from app.services import auth
from app.tasks import digest

USER_ID = "3f2c1a4e-9b7d-4c1e-8a55-0d6f3b2a1c90"
STATS = {
    "jobs_added": 3, "applied": 2, "replies": 5, "interview": 1, "follow_ups_due": 6,
    "resume_versions": 4, "ai_cost": 0.01234,
}


# --------------------------------------------------------------------------- html
def test_digest_html_shows_the_numbers_and_an_unsubscribe_link():
    html = digest.build_digest_html("My Search", STATS, "https://app.example/unsubscribe?token=abc")
    for needle in ("Jobs added", "Applied", "Replies", "Moved to interview", "Follow-ups due", "Resume versions", "$0.0123"):
        assert needle in html
    assert 'href="https://app.example/unsubscribe?token=abc"' in html


def test_digest_html_escapes_the_user_controlled_workspace_name_and_url():
    html = digest.build_digest_html('<script>alert(1)</script>', STATS, 'https://x.example/?a="><img src=x>')
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert '"><img' not in html  # the href attribute can't be broken out of


def test_digest_is_still_rendered_when_every_count_is_zero():
    zero = {
        "jobs_added": 0, "applied": 0, "replies": 0, "interview": 0, "follow_ups_due": 0,
        "resume_versions": 0, "ai_cost": 0.0,
    }
    assert "$0.0000" in digest.build_digest_html("ws", zero, "https://x.example/u")


# --------------------------------------------------------------------------- slot
@pytest.mark.parametrize(
    "hour,minute,expected",
    [(1, 30, "2026-10-05-am"), (12, 30, "2026-10-05-pm"), (5, 59, "2026-10-05-am"), (6, 0, "2026-10-05-pm")],
)
def test_slot_separates_the_morning_and_evening_runs(hour, minute, expected):
    assert digest._slot(datetime(2026, 10, 5, hour, minute, tzinfo=timezone.utc)) == expected


# --------------------------------------------------------------------------- unsubscribe token
def test_unsubscribe_token_round_trips():
    token = auth.create_digest_unsubscribe_token(USER_ID)
    assert auth.decode_digest_unsubscribe_token(token) == USER_ID


def test_unsubscribe_token_rejects_tampering_garbage_and_expiry(monkeypatch):
    token = auth.create_digest_unsubscribe_token(USER_ID)
    assert auth.decode_digest_unsubscribe_token(token[:-2] + "xx") is None
    assert auth.decode_digest_unsubscribe_token("not-a-token") is None
    assert auth.decode_digest_unsubscribe_token("") is None

    monkeypatch.setattr(auth, "DIGEST_UNSUB_TTL", timedelta(seconds=-5))
    expired = auth.create_digest_unsubscribe_token(USER_ID)
    assert auth.decode_digest_unsubscribe_token(expired) is None


def test_unsubscribe_token_cannot_be_used_as_a_login():
    """A leaked unsubscribe link must not be a valid API credential."""
    token = auth.create_digest_unsubscribe_token(USER_ID)
    with pytest.raises(Exception):
        auth.decode_access_token(token)


def test_an_access_token_is_not_accepted_as_an_unsubscribe_token():
    access = auth.create_access_token(USER_ID, "a@example.test", "user")
    assert auth.decode_digest_unsubscribe_token(access) is None


def test_unsubscribe_token_needs_the_right_purpose_and_a_uuid_subject():
    key = auth._digest_unsub_key()
    exp = datetime.now(timezone.utc) + timedelta(days=1)
    wrong_purpose = jwt.encode({"sub": USER_ID, "purpose": "something_else", "exp": exp}, key, algorithm="HS256")
    no_purpose = jwt.encode({"sub": USER_ID, "exp": exp}, key, algorithm="HS256")
    bad_subject = jwt.encode({"sub": "not-a-uuid", "purpose": "digest_unsub", "exp": exp}, key, algorithm="HS256")
    for token in (wrong_purpose, no_purpose, bad_subject):
        assert auth.decode_digest_unsubscribe_token(token) is None


# --------------------------------------------------------------------------- schema
def test_profile_update_can_set_but_not_null_the_digest_flag():
    assert UserProfileUpdate(digest_enabled=False).model_dump(exclude_unset=True) == {"digest_enabled": False}
    assert UserProfileUpdate().model_dump(exclude_unset=True) == {}
    with pytest.raises(ValueError):
        UserProfileUpdate(digest_enabled=None)


# --------------------------------------------------------------------------- task guards
def test_daily_digest_does_nothing_when_smtp_is_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_PASS", "")
    # No DB engine is created before this check, so this needs no database.
    result = digest.send_daily_digest.run()
    assert result["error"] == "smtp_not_configured"
    assert result["sent"] == 0


def test_test_digest_reports_missing_smtp(monkeypatch):
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_PASS", "")
    assert digest.send_digest_for_user.run(USER_ID) == {"sent": False, "error": "smtp_not_configured"}
