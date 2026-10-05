"""tracking core: job source/identity/lifecycle columns, job_events, workspace_settings

Revision ID: 0003_tracking_core
Revises: 0002_digest_prefs
Create Date: 2026-10-05

Expand-only and idempotent (every statement is IF NOT EXISTS / guarded), so code from before this
revision keeps working against the migrated schema and a re-run is a no-op.

Back-fill notes
* `trg_jobs_updated_at` is switched off while history is back-filled; otherwise every job's
  `updated_at` would jump to "now", which distorts ordering and the digest.
* Lifecycle timestamps for pre-existing jobs are *approximations* (the old schema never recorded
  when a card moved). They are chosen to under- rather than over-count: e.g. `applied_at` falls back
  to `created_at`, never to a recent edit time, unless the job is still sitting in "applied".
* Duplicate URLs already exist (the extension never de-duplicated). The best row per
  (workspace, url_hash) keeps its hash; the others get `url_hash = NULL`, so nothing is deleted and
  the unique index can be created.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_tracking_core"
down_revision = "0002_digest_prefs"
branch_labels = None
depends_on = None

REPLY_STATUSES = "('acknowledged', 'screening', 'interview', 'offer', 'negotiating')"


def _updated_at_trigger(enabled: bool) -> None:
    action = "ENABLE" if enabled else "DISABLE"
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_trigger
                       WHERE tgname = 'trg_jobs_updated_at' AND tgrelid = 'jobs'::regclass) THEN
                ALTER TABLE jobs {action} TRIGGER trg_jobs_updated_at;
            END IF;
        END
        $$
        """
    )


def _backfill_identity(bind) -> None:
    """source / url_hash / content_hash for rows that haven't been processed yet."""
    # Imported here so merely loading this revision never needs the app; at upgrade time env.py
    # has already imported it anyway. Using the live module (not a frozen copy) means rows
    # back-filled now hash exactly the way the running code will hash new rows.
    from app.services.job_url import content_hash, detect_source, url_hash

    rows = bind.execute(
        sa.text("SELECT id, url, company, title, location FROM jobs WHERE content_hash IS NULL")
    ).fetchall()
    batch = [
        {
            "id": r.id,
            "source": detect_source(r.url),
            "url_hash": url_hash(r.url),
            "content_hash": content_hash(r.company, r.title, r.location),
        }
        for r in rows
    ]
    for i in range(0, len(batch), 500):
        bind.execute(
            sa.text(
                "UPDATE jobs SET source = :source, url_hash = :url_hash, content_hash = :content_hash "
                "WHERE id = :id"
            ),
            batch[i : i + 500],
        )


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------ jobs columns
    op.execute(
        """
        ALTER TABLE jobs
            ADD COLUMN IF NOT EXISTS source VARCHAR(40) NOT NULL DEFAULT 'manual',
            ADD COLUMN IF NOT EXISTS external_id TEXT,
            ADD COLUMN IF NOT EXISTS apply_url TEXT,
            ADD COLUMN IF NOT EXISTS url_hash VARCHAR(64),
            ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64),
            ADD COLUMN IF NOT EXISTS shortlisted_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS tailored_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS interview_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS follow_up_at DATE
        """
    )

    # ------------------------------------------------------------------ new tables
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS job_events (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            kind          VARCHAR(30) NOT NULL,
            from_status   VARCHAR(20),
            to_status     VARCHAR(20),
            actor         VARCHAR(20) NOT NULL DEFAULT 'user',
            confidence    NUMERIC(4, 3),
            ref_id        TEXT,
            meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
            occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_job_events_workspace_time ON job_events (workspace_id, occurred_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_job_events_job_time ON job_events (job_id, occurred_at)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_events_workspace_kind "
        "ON job_events (workspace_id, kind, to_status, occurred_at)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_settings (
            workspace_id    UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
            weekly_target   INT NOT NULL DEFAULT 10,
            follow_up_days  INT NOT NULL DEFAULT 7,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    # ------------------------------------------------------------------ back-fill
    _updated_at_trigger(False)

    _backfill_identity(bind)

    # Keep the best row per (workspace, url_hash): in progress beats saved, then has documents,
    # then oldest. The rest lose their hash (kept, just not unique-checked).
    op.execute(
        """
        WITH ranked AS (
            SELECT j.id,
                   ROW_NUMBER() OVER (
                       PARTITION BY j.workspace_id, j.url_hash
                       ORDER BY (j.status <> 'wishlist') DESC,
                                EXISTS (SELECT 1 FROM job_artifacts a WHERE a.job_id = j.id) DESC,
                                j.created_at ASC,
                                j.id ASC
                   ) AS rn
            FROM jobs j
            WHERE j.url_hash IS NOT NULL
        )
        UPDATE jobs SET url_hash = NULL
        FROM ranked
        WHERE jobs.id = ranked.id AND ranked.rn > 1
        """
    )

    op.execute(
        """
        UPDATE jobs SET applied_at = LEAST(
            COALESCE(
                (date_applied::timestamp AT TIME ZONE 'UTC') + interval '12 hours',
                CASE WHEN status = 'applied' THEN updated_at ELSE created_at END
            ),
            updated_at
        )
        WHERE applied_at IS NULL
          AND status <> 'wishlist'
          AND (status <> 'rejected' OR date_applied IS NOT NULL)
        """
    )
    op.execute(
        f"""
        UPDATE jobs SET last_reply_at = updated_at
        WHERE last_reply_at IS NULL
          AND (status IN {REPLY_STATUSES} OR (status = 'rejected' AND date_applied IS NOT NULL))
        """
    )
    op.execute("UPDATE jobs SET interview_at = updated_at WHERE interview_at IS NULL AND status = 'interview'")
    op.execute(
        """
        UPDATE jobs SET tailored_at = a.first_at
        FROM (SELECT job_id, MIN(created_at) AS first_at
              FROM job_artifacts WHERE kind = 'tailored_resume' GROUP BY job_id) a
        WHERE jobs.id = a.job_id AND jobs.tailored_at IS NULL
        """
    )

    # One 'created' event per job, plus one approximate 'status_changed' for jobs that have moved.
    op.execute(
        """
        INSERT INTO job_events (workspace_id, job_id, kind, from_status, to_status, actor, occurred_at, meta)
        SELECT j.workspace_id, j.id, 'created', NULL, 'wishlist', 'system', j.created_at,
               jsonb_build_object('backfilled', true)
        FROM jobs j
        WHERE NOT EXISTS (SELECT 1 FROM job_events e WHERE e.job_id = j.id AND e.kind = 'created')
        """
    )
    op.execute(
        """
        INSERT INTO job_events (workspace_id, job_id, kind, from_status, to_status, actor, occurred_at, meta)
        SELECT j.workspace_id, j.id, 'status_changed', 'wishlist', j.status, 'system',
               GREATEST(j.created_at,
                        COALESCE(CASE WHEN j.status = 'applied' THEN j.applied_at END,
                                 j.last_reply_at, j.applied_at, j.updated_at)),
               jsonb_build_object('backfilled', true, 'approximate', true)
        FROM jobs j
        WHERE j.status <> 'wishlist'
          AND NOT EXISTS (SELECT 1 FROM job_events e WHERE e.job_id = j.id AND e.kind = 'status_changed')
        """
    )

    _updated_at_trigger(True)

    # ------------------------------------------------------------------ indexes (after dedupe)
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_workspace_url_hash "
        "ON jobs (workspace_id, url_hash) WHERE url_hash IS NOT NULL"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_jobs_workspace_source ON jobs (workspace_id, source)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_ai_cost_logs_workspace_created ON ai_cost_logs (workspace_id, created_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_ai_cost_logs_workspace_created")
    op.execute("DROP INDEX IF EXISTS idx_jobs_workspace_source")
    op.execute("DROP INDEX IF EXISTS uq_jobs_workspace_url_hash")
    op.execute("DROP TABLE IF EXISTS workspace_settings")
    op.execute("DROP TABLE IF EXISTS job_events")
    op.execute(
        """
        ALTER TABLE jobs
            DROP COLUMN IF EXISTS follow_up_at,
            DROP COLUMN IF EXISTS interview_at,
            DROP COLUMN IF EXISTS last_reply_at,
            DROP COLUMN IF EXISTS applied_at,
            DROP COLUMN IF EXISTS approved_at,
            DROP COLUMN IF EXISTS tailored_at,
            DROP COLUMN IF EXISTS shortlisted_at,
            DROP COLUMN IF EXISTS content_hash,
            DROP COLUMN IF EXISTS url_hash,
            DROP COLUMN IF EXISTS apply_url,
            DROP COLUMN IF EXISTS external_id,
            DROP COLUMN IF EXISTS source
        """
    )
