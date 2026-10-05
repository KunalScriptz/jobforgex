"""M0 foundations: guards against regressions in things that are easy to break silently.

No database needed.
"""
import importlib
from pathlib import Path

import pytest

from app.main import app
from app.models.job import JobStatus
from app.schemas.job import JobStatusEnum

BACKEND_DIR = Path(__file__).resolve().parents[1]


# --------------------------------------------------------------------------- auth coverage
# Routes that are public on purpose. Anything NOT listed here must require authentication, so a
# new route that forgets `Depends(get_current_user)` fails this test instead of shipping open.
PUBLIC_ROUTES = {
    # sign-in / account flows
    ("POST", "/api/v1/auth/register"), ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/refresh"), ("POST", "/api/v1/auth/logout"),
    ("POST", "/api/v1/auth/forgot-password"), ("POST", "/api/v1/auth/reset-password"),
    ("POST", "/api/v1/auth/verify-email"),
    ("GET", "/api/v1/auth/google/login"), ("GET", "/api/v1/auth/google/callback"),
    # public pricing page
    ("GET", "/api/v1/billing/pricing"),
    # one-click unsubscribe from the digest email: the signed token is the credential
    ("POST", "/api/v1/users/digest/unsubscribe"),
    # Chrome extension: authenticated with its own `jfx_` token, not the user JWT
    ("GET", "/api/v1/extension/profile"), ("POST", "/api/v1/extension/jobs"),
    ("GET", "/api/v1/extension/download"),
    # signature-verified webhook
    ("POST", "/api/v1/webhooks/razorpay"),
    # infra / static
    ("GET", "/health"), ("GET", "/health/ready"), ("GET", "/health/live"),
    ("GET", "/"), ("GET", "/logo.png"), ("GET", "/extension-version.json"),
}

_HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


def _operations():
    """(method, path, has_security) for every operation, read from the public OpenAPI schema.

    Deliberately not `app.routes`: newer FastAPI wraps included routers in lazy objects, so
    iterating app.routes silently sees almost nothing (an earlier version of this test passed
    vacuously because of that). `get_current_user` depends on HTTPBearer, so every route behind it
    - including via current_workspace_id / require_admin - carries a `security` requirement.
    """
    for path, ops in app.openapi()["paths"].items():
        for method, op in ops.items():
            if method.upper() in _HTTP_METHODS:
                yield method.upper(), path, bool(op.get("security"))


def test_every_non_public_route_requires_auth():
    ops = list(_operations())
    protected = [(m, p) for m, p, secured in ops if secured]
    # Guard against a vacuous pass: the app has dozens of authenticated operations.
    assert len(protected) > 30, f"only {len(protected)} protected operations found"

    leaked = sorted(f"{m} {p}" for m, p, secured in ops if not secured and (m, p) not in PUBLIC_ROUTES)
    assert not leaked, f"routes without an auth dependency: {leaked}"


def test_public_allowlist_has_no_stale_entries():
    """Keeps the allowlist honest: every entry must still be a real, currently-open route."""
    open_ops = {(m, p) for m, p, secured in _operations() if not secured}
    stale = sorted(e for e in PUBLIC_ROUTES if e not in open_ops)
    assert not stale, f"allowlisted routes that are gone or now protected: {stale}"


# --------------------------------------------------------------------------- job statuses
def test_job_status_values():
    assert {s.value for s in JobStatus} == {
        "wishlist", "applied", "acknowledged", "screening",
        "interview", "offer", "negotiating", "rejected",
    }


def test_job_status_fits_the_varchar_20_column():
    assert max(len(s.value) for s in JobStatus) <= 20


def test_schema_enum_is_the_model_enum():
    # One source of truth: a status the DB can hold must never 500 JobOut serialisation.
    assert JobStatusEnum is JobStatus


# --------------------------------------------------------------------------- celery
def test_celery_tasks_are_registered():
    """Regression: autodiscover_tasks(['app.tasks']) imported a non-existent module, so the
    worker registered zero tasks and the Beat digest never ran."""
    from app.celery_app import celery_app

    celery_app.loader.import_default_modules()
    assert "app.tasks.digest.send_daily_digest" in celery_app.tasks


def test_digest_beat_schedule_is_opt_in(monkeypatch):
    import app.celery_app as celery_module
    from app.config import settings

    try:
        monkeypatch.setattr(settings, "DIGEST_ENABLED", False)
        importlib.reload(celery_module)
        assert celery_module.celery_app.conf.beat_schedule == {}

        monkeypatch.setattr(settings, "DIGEST_ENABLED", True)
        importlib.reload(celery_module)
        schedule = celery_module.celery_app.conf.beat_schedule
        assert {e["task"] for e in schedule.values()} == {"app.tasks.digest.send_daily_digest"}
        # 7:00 AM IST = 01:30 UTC and 6:00 PM IST = 12:30 UTC
        times = sorted((next(iter(e["schedule"].hour)), next(iter(e["schedule"].minute))) for e in schedule.values())
        assert times == [(1, 30), (12, 30)]
    finally:
        monkeypatch.undo()
        importlib.reload(celery_module)


# --------------------------------------------------------------------------- alembic
def _script_directory():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return ScriptDirectory.from_config(cfg)


def test_alembic_has_a_single_linear_head():
    script = _script_directory()
    assert len(script.get_heads()) == 1, "multiple Alembic heads: merge them"
    revisions = list(script.walk_revisions())
    roots = [r for r in revisions if r.down_revision is None]
    assert [r.revision for r in roots] == ["0001_baseline"]


def test_baseline_sql_is_vendored():
    names = sorted(p.name for p in (BACKEND_DIR / "alembic" / "baseline_sql").glob("*.sql"))
    assert names == [
        "001_init.sql", "002_company_domain.sql", "003_resume_templates.sql",
        "004_fix_defaults.sql", "005_user_profile.sql", "006_profile_extras.sql",
    ]


def test_baseline_heal_path_is_ddl_only_and_idempotent():
    """On an existing DB the baseline must never run data-changing SQL or non-idempotent DDL."""
    # The module name starts with a digit, so it can't be imported normally: load it by path.
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "baseline_0001", BACKEND_DIR / "alembic" / "versions" / "0001_baseline.py"
    )
    baseline = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(baseline)

    assert baseline.HEAL_DDL, "heal list must not be empty"
    for stmt in baseline.HEAL_DDL:
        upper = stmt.upper()
        assert upper.startswith("ALTER TABLE"), stmt
        assert "ADD COLUMN IF NOT EXISTS" in upper, stmt
        assert "UPDATE " not in upper and "DELETE " not in upper, stmt
