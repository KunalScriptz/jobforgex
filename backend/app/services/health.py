"""Real dependency checks for the admin System tab and the daily admin summary.

The public `/health` endpoints are static on purpose (they are liveness probes). These actually
talk to Postgres, Redis, MinIO, the LaTeX server and the Celery workers.

Everything here is synchronous so the same code runs from the API (via a thread) and from a Celery
task, where an asyncio engine created in another event loop would not be safe to reuse.
No check ever raises: a failure is reported as ok=False with a short reason.
"""
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout

import httpx
import redis
from sqlalchemy import create_engine, text

from app.config import settings

CHECK_TIMEOUT_S = 3
# Hard ceiling per check. The individual checks set their own socket timeouts, but client
# libraries retry (urllib3, kombu) and could otherwise hold the whole panel for 20+ seconds
# in exactly the situation it exists for: a dependency being down.
DEADLINE_S = 5

_engine = None


def _sync_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(
            settings.DATABASE_URL_SYNC,
            pool_pre_ping=True,
            pool_size=1,
            max_overflow=0,
            connect_args={"connect_timeout": CHECK_TIMEOUT_S},
        )
    return _engine


def _check_postgres() -> str | None:
    with _sync_engine().connect() as conn:
        conn.execute(text("SELECT 1"))
    return None


def _check_redis() -> str | None:
    client = redis.from_url(settings.REDIS_URL, socket_timeout=CHECK_TIMEOUT_S, socket_connect_timeout=CHECK_TIMEOUT_S)
    try:
        client.ping()
    finally:
        client.close()
    return None


def _check_minio() -> str | None:
    import urllib3
    from minio import Minio

    # A throwaway client with no retries and short timeouts: the shared one in services/storage
    # uses urllib3's defaults (5 retries with backoff), which takes ~20s to give up on a dead host.
    client = Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
        http_client=urllib3.PoolManager(
            timeout=urllib3.Timeout(connect=CHECK_TIMEOUT_S, read=CHECK_TIMEOUT_S),
            retries=urllib3.Retry(total=0),
        ),
    )
    if not client.bucket_exists(settings.MINIO_BUCKET):
        return f"bucket '{settings.MINIO_BUCKET}' does not exist"
    return None


def _check_latex() -> str | None:
    url = settings.LATEX_COMPILE_URL.rstrip("/")
    if not url:
        return "LATEX_COMPILE_URL is not set"
    res = httpx.get(f"{url}/health", timeout=CHECK_TIMEOUT_S)
    if res.status_code != 200:
        return f"HTTP {res.status_code}"
    return None


def _check_celery() -> str | None:
    from app.celery_app import celery_app

    # Fail fast on an unreachable broker instead of letting kombu retry for a long time.
    with celery_app.connection_for_read() as conn:
        conn.ensure_connection(max_retries=1, interval_start=0, interval_step=0, timeout=CHECK_TIMEOUT_S)
        replies = celery_app.control.inspect(connection=conn, timeout=1.5).ping()
    if not replies:
        return "no worker answered"
    return None


def _check_ai_key() -> str | None:
    # Configuration only: a real call would cost money on every refresh of the System tab.
    if not settings.DEEPSEEK_API_KEY.strip():
        return "DEEPSEEK_API_KEY is not set"
    return None


def _check_smtp() -> str | None:
    if not (settings.SMTP_USER and settings.SMTP_PASS):
        return "SMTP_USER / SMTP_PASS are not set (no emails will be sent)"
    return None


CHECKS = [
    ("PostgreSQL", _check_postgres),
    ("Redis", _check_redis),
    ("MinIO storage", _check_minio),
    ("LaTeX server", _check_latex),
    ("Celery worker", _check_celery),
    ("AI provider key", _check_ai_key),
    ("Email (SMTP)", _check_smtp),
]


def _run(name: str, fn) -> dict:
    started = time.monotonic()
    try:
        problem = fn()
    except Exception as e:  # a health check must report, never raise
        problem = f"{type(e).__name__}: {e}"[:200]
    return {
        "name": name,
        "ok": problem is None,
        "latency_ms": round((time.monotonic() - started) * 1000),
        "detail": problem,
    }


def run_health_checks() -> list[dict]:
    pool = ThreadPoolExecutor(max_workers=len(CHECKS))
    started = time.monotonic()
    futures = [(name, pool.submit(_run, name, fn)) for name, fn in CHECKS]
    results = []
    for name, future in futures:
        remaining = max(0.1, DEADLINE_S - (time.monotonic() - started))
        try:
            results.append(future.result(timeout=remaining))
        except FutureTimeout:
            results.append({"name": name, "ok": False, "latency_ms": DEADLINE_S * 1000, "detail": f"no answer after {DEADLINE_S}s"})
    # Don't wait for stragglers: a stuck check must not hold the response (or the Celery task).
    pool.shutdown(wait=False, cancel_futures=True)
    return results
