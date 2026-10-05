"""baseline: schema as created by the legacy SQL files 001-006

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-05

Until now the schema came from hand-written SQL (mounted into postgres' initdb, so it only ever
ran on an empty volume). This revision makes Alembic the single owner of the schema:

* Empty database (no `users` table): execute the vendored 001-006 SQL in order.
* Existing database (created by the old initdb mounts, or by hand): run ONLY the idempotent
  `ADD COLUMN IF NOT EXISTS` DDL, so a DB that missed a late column is healed. The data fixes in
  003/004 (`UPDATE resumes SET is_default ...`) are NOT replayed on a populated DB: they fire the
  `updated_at` trigger and can flip a workspace's chosen default resume. They only run if the
  `resumes.is_default` column did not exist yet, i.e. when there was nothing to preserve.
"""
from pathlib import Path

from alembic import op
import sqlalchemy as sa

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

SQL_DIR = Path(__file__).resolve().parent.parent / "baseline_sql"

# Mirrors the DDL-only statements of 002, 003 (column only), 005 and 006.
HEAL_DDL = [
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_domain TEXT",
    "ALTER TABLE resumes ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS current_salary NUMERIC(12, 2)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_currency VARCHAR(3)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_frequency VARCHAR(10)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_preset TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_url TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio_url TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS current_title TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS current_company TEXT",
]


def _exec_script(sql: str) -> None:
    """Run a multi-statement SQL script through the raw DBAPI cursor.

    psycopg2 uses the simple-query protocol here, so `$$` function bodies and literal `%`
    characters are handled correctly (SQLAlchemy's text()/exec_driver_sql would try to parse
    them). It's the same connection, so it stays inside Alembic's transaction.
    """
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(sql)
    finally:
        cursor.close()


def _column_exists(bind, table: str, column: str) -> bool:
    row = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).first()
    return row is not None


def upgrade() -> None:
    bind = op.get_bind()
    is_fresh = bind.execute(sa.text("SELECT to_regclass('users') IS NULL")).scalar()

    if is_fresh:
        for path in sorted(SQL_DIR.glob("[0-9][0-9][0-9]_*.sql")):
            _exec_script(path.read_text(encoding="utf-8"))
        return

    had_is_default = _column_exists(bind, "resumes", "is_default")
    for ddl in HEAL_DDL:
        op.execute(ddl)
    if not had_is_default:
        # Nothing to preserve: backfill defaults exactly as 003/004 did.
        _exec_script((SQL_DIR / "003_resume_templates.sql").read_text(encoding="utf-8"))
        _exec_script((SQL_DIR / "004_fix_defaults.sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    # The baseline is the floor: there is nothing earlier to return to.
    pass
