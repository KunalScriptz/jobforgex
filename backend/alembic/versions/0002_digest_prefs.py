"""users.digest_enabled: per-user opt-out for the daily digest email

Revision ID: 0002_digest_prefs
Revises: 0001_baseline
Create Date: 2026-10-05

Expand-only: a NOT NULL column with a constant default is a metadata-only change on
PostgreSQL 11+, and code from before this revision simply ignores the column.
"""
from alembic import op

revision = "0002_digest_prefs"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN NOT NULL DEFAULT TRUE")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS digest_enabled")
