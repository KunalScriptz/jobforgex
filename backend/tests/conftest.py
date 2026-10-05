"""Shared test setup.

Most tests need no database. DB-backed tests are opt-in: point TEST_DATABASE_URL_SYNC at a
**scratch** Postgres (e.g. postgresql+psycopg2://user:pw@localhost:5433/jobforgex_test) and they
run against it; without it they are skipped. The target database is migrated to head by the
`migrated_db` fixture, so it can start empty.

    TEST_DATABASE_URL_SYNC=postgresql+psycopg2://... .venv/bin/python -m pytest -q

Never point this at a database with real data: tests insert rows and do not clean up the schema.
"""
import os
from pathlib import Path

import pytest

TEST_DB_SYNC = os.environ.get("TEST_DATABASE_URL_SYNC", "")

# Must happen before anything imports app.config / app.database (both build the engine from
# settings at import time), which is why it lives at conftest import rather than in a fixture.
if TEST_DB_SYNC:
    os.environ["DATABASE_URL_SYNC"] = TEST_DB_SYNC
    os.environ["DATABASE_URL"] = TEST_DB_SYNC.replace("postgresql+psycopg2", "postgresql+asyncpg", 1)

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def migrated_db():
    """Apply Alembic migrations to the test database (skip if none is configured/reachable)."""
    if not TEST_DB_SYNC:
        pytest.skip("set TEST_DATABASE_URL_SYNC to run DB-backed tests")

    from sqlalchemy import create_engine, text

    engine = create_engine(TEST_DB_SYNC)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # unreachable DB -> skip rather than fail the whole suite
        pytest.skip(f"test database not reachable: {exc}")
    finally:
        engine.dispose()

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")
    return TEST_DB_SYNC
