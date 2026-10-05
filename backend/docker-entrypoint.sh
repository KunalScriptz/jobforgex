#!/bin/sh
# Container entrypoint shared by backend, celery-worker and celery-beat.
#   RUN_MIGRATIONS=1       -> apply Alembic migrations before starting (backend only)
#   WAIT_FOR_MIGRATIONS=1  -> block until the DB is at the code's Alembic head (worker/beat)
# Anything else just execs the container command unchanged.
set -e

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
    echo "[entrypoint] running alembic upgrade head"
    alembic upgrade head
elif [ "${WAIT_FOR_MIGRATIONS:-0}" = "1" ]; then
    echo "[entrypoint] waiting for migrations"
    python -m app.scripts.wait_for_head
fi

exec "$@"
