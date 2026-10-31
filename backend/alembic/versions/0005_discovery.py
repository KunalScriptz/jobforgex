"""discovery: saved searches, the discovered-jobs inbox, per-workspace opt-in

Revision ID: 0005_discovery
Revises: 0004_admin
Create Date: 2026-10-31

Expand-only and idempotent: two new tables and one new defaulted column, nothing dropped or
changed, so code from before this revision ignores them.
"""
from alembic import op

revision = "0005_discovery"
down_revision = "0004_admin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS discovery_enabled BOOLEAN NOT NULL DEFAULT false")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS discovery_searches (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            name           VARCHAR(120) NOT NULL,
            search_term    VARCHAR(200) NOT NULL,
            location       VARCHAR(200),
            country        VARCHAR(40),
            sites          JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_remote      BOOLEAN NOT NULL DEFAULT false,
            hours_old      INTEGER NOT NULL DEFAULT 72,
            results_wanted INTEGER NOT NULL DEFAULT 30,
            enabled        BOOLEAN NOT NULL DEFAULT true,
            last_run_at    TIMESTAMPTZ,
            last_status    VARCHAR(20),
            last_result    JSONB,
            last_error     TEXT,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_discovery_searches_workspace ON discovery_searches (workspace_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS discovered_jobs (
            id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            search_id          UUID REFERENCES discovery_searches(id) ON DELETE SET NULL,
            source             VARCHAR(40) NOT NULL,
            title              VARCHAR(300) NOT NULL,
            company            VARCHAR(200) NOT NULL DEFAULT '',
            location           VARCHAR(300),
            url                VARCHAR(1000) NOT NULL,
            description        TEXT NOT NULL DEFAULT '',
            date_posted        DATE,
            salary_text        VARCHAR(120),
            is_remote          BOOLEAN,
            url_hash           VARCHAR(64) NOT NULL,
            content_hash       VARCHAR(64),
            keyword_score      INTEGER NOT NULL DEFAULT 0,
            fit_score          INTEGER,
            fit_reason         VARCHAR(400),
            state              VARCHAR(12) NOT NULL DEFAULT 'new',
            added_job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
            possible_duplicate BOOLEAN NOT NULL DEFAULT false,
            first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_discovered_workspace_url_hash ON discovered_jobs (workspace_id, url_hash)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_discovered_workspace_state ON discovered_jobs (workspace_id, state, first_seen_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS discovered_jobs")
    op.execute("DROP TABLE IF EXISTS discovery_searches")
    op.execute("ALTER TABLE workspace_settings DROP COLUMN IF EXISTS discovery_enabled")
