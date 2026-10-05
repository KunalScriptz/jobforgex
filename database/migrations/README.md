# database/migrations (frozen)

The schema is now owned by **Alembic** (`backend/alembic/`). Do not add SQL files here.

- The original `001`-`006` SQL files moved to `backend/alembic/baseline_sql/`. They are replayed
  only by `0001_baseline` on an **empty** database; on an existing one it applies just the
  idempotent `ADD COLUMN IF NOT EXISTS` statements.
- New schema changes are Alembic revisions in `backend/alembic/versions/`. The backend container
  runs `alembic upgrade head` on start (`RUN_MIGRATIONS=1`), and CI runs it once before it tears
  the old containers down. Worker/beat wait for the head (`WAIT_FOR_MIGRATIONS=1`).
- Rules for revisions: expand-only (no drops, renames or type narrowing), idempotent DDL
  (`IF NOT EXISTS`), a real `downgrade()` that removes only what the revision added, and
  `jobs.status` stays VARCHAR(20).

Create one with `cd backend && alembic revision -m "short description"` (the template in
`backend/alembic/script.py.mako` carries these rules).
