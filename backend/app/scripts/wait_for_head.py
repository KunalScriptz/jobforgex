"""Block until the database has been migrated to this code's Alembic head.

Used as the startup gate for the Celery worker/beat containers (WAIT_FOR_MIGRATIONS=1), so they
never run against a half-migrated schema while the backend container is still migrating.

Exit 0 when ready, 1 on timeout (the container's restart policy then retries).
"""
import sys
import time
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.util.exc import CommandError
from sqlalchemy import create_engine, text

from app.config import settings

TIMEOUT_S = 180
INTERVAL_S = 2

BACKEND_DIR = Path(__file__).resolve().parents[2]


_last_error: str | None = None


def _current_revision(engine) -> str | None:
    """The DB's alembic revision, or None if it can't be read yet (no table / DB unreachable)."""
    global _last_error
    try:
        with engine.connect() as conn:
            return conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception as exc:
        # Usually just "alembic_version doesn't exist yet" while the backend is still migrating.
        # Log each *distinct* error once so a genuine problem (bad password, DB down) is visible
        # instead of silently looping until the timeout.
        msg = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
        if msg != _last_error:
            _last_error = msg
            print(f"[wait_for_head] cannot read alembic_version yet: {msg}", flush=True)
        return None


def main() -> int:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    script = ScriptDirectory.from_config(cfg)
    head = script.get_current_head()

    engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)
    deadline = time.monotonic() + TIMEOUT_S
    while time.monotonic() < deadline:
        current = _current_revision(engine)
        if current == head:
            print(f"[wait_for_head] database is at head ({head})", flush=True)
            return 0
        if current is not None:
            try:
                script.get_revision(current)
            except CommandError:
                # DB is *ahead* of this code (e.g. a code rollback). Revisions are expand-only,
                # so older code stays compatible; don't block on it.
                print(
                    f"[wait_for_head] database revision {current} is newer than this code's "
                    f"head {head}; continuing",
                    flush=True,
                )
                return 0
        time.sleep(INTERVAL_S)

    print(f"[wait_for_head] timed out waiting for {head} (current: {current})", file=sys.stderr, flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())
