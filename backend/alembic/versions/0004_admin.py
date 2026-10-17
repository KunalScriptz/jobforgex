"""admin dashboard: last_login_at, instance settings, signup allowlist, AI caps, failure + audit logs

Revision ID: 0004_admin
Revises: 0003_tracking_core
Create Date: 2026-10-17

Expand-only and idempotent. Everything is a new nullable column or a new table, so code from before
this revision ignores it. Nothing is back-filled: `last_login_at` fills in as people sign in.
"""
from alembic import op

revision = "0004_admin"
down_revision = "0003_tracking_core"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ")
    # Per-user override of the instance-wide monthly AI cap. Distinct from the user's own
    # workspaces.monthly_budget_usd, which is a self-set reminder rather than an enforced limit.
    op.execute("ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS admin_ai_cap_usd NUMERIC(10, 4)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS instance_settings (
            key        VARCHAR(64) PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS signup_allowlist (
            email      VARCHAR(320) PRIMARY KEY,
            invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_failure_log (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
            user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
            purpose      VARCHAR(64) NOT NULL,
            error_kind   VARCHAR(32) NOT NULL,
            message      TEXT,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_ai_failure_log_created_at ON ai_failure_log (created_at DESC)")
    # No FK on the target: an audit row about a deleted user must outlive that user.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_audit_log (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            admin_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
            admin_email     VARCHAR(320) NOT NULL,
            action          VARCHAR(64) NOT NULL,
            target_user_id  UUID,
            target_email    VARCHAR(320),
            detail          JSONB,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_admin_audit_log_created_at ON admin_audit_log (created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS admin_audit_log")
    op.execute("DROP TABLE IF EXISTS ai_failure_log")
    op.execute("DROP TABLE IF EXISTS signup_allowlist")
    op.execute("DROP TABLE IF EXISTS instance_settings")
    op.execute("ALTER TABLE workspaces DROP COLUMN IF EXISTS admin_ai_cap_usd")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS last_login_at")
