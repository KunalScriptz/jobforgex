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
import pytest_asyncio

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


@pytest_asyncio.fixture
async def client(migrated_db, monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.database import get_db
    from app.main import app
    from app.services import ai as ai_service
    from app.services import storage as storage_service

    # The tests never need object storage or an LLM; make any accidental call loud.
    async def fake_pdf_bytes(path):
        return b"%PDF-1.4 fake"

    async def no_llm(*args, **kwargs):
        raise AssertionError("call_deepseek must not be reached for a rejected request")

    monkeypatch.setattr(storage_service, "get_pdf_bytes", fake_pdf_bytes)
    monkeypatch.setattr(ai_service, "call_deepseek", no_llm)

    # A pool-less engine per test: the app's global pool can't be shared across pytest's loops.
    engine = create_async_engine(os.environ["DATABASE_URL"], poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()
