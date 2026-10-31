"""Daily job discovery: scrape each opted-in workspace's saved searches into its inbox, score the
new postings, and prune stale ones.

Scheduled in celery_app.py only when FEATURE_DISCOVERY is on. These tasks route to the `discovery`
queue, which a dedicated low-concurrency worker consumes (scrapes are slow and must not starve
email/digest tasks). A workspace is run at most once a day by the scheduler (Redis claim, released
on failure); the on-demand "Run now" is guarded against overlapping runs.
"""
import asyncio
import uuid
from datetime import datetime, timezone

from celery.utils.log import get_task_logger
from sqlalchemy import create_engine, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.celery_app import celery_app
from app.config import settings
from app.models.discovery import DiscoverySearch
from app.models.workspace import Workspace
from app.models.workspace_settings import WorkspaceSettings
from app.services import discovery as discovery_service
from app.services import discovery_scoring, ratelimit
from app.services.discovery_sources import redact

logger = get_task_logger(__name__)

DEDUPE_TTL_S = 20 * 3600
RUN_LOCK_TTL_S = 30 * 60  # a run that dies without releasing frees itself after this


def _score(loop: asyncio.AbstractEventLoop, ws: Workspace, resume_text: str, search_terms: str) -> dict:
    """AI-score the workspace's new postings on this task's own event loop and connection."""

    async def go() -> dict:
        engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                return await discovery_scoring.score_workspace(
                    db, ws.id, ws.owner_user_id, resume_text=resume_text, search_terms=search_terms
                )
        finally:
            await engine.dispose()

    return loop.run_until_complete(go())


def run_workspace(session: Session, loop: asyncio.AbstractEventLoop, ws: Workspace) -> dict:
    """Run every enabled search of one workspace, then score what's new. Never raises for a
    source or AI failure: those are reported in the returned summary / on each search."""
    summary = {"workspace": str(ws.id), "searches": 0, "new": 0, "scored": 0, "scoring_stopped": None}
    searches = list(
        session.execute(
            select(DiscoverySearch)
            .where(DiscoverySearch.workspace_id == ws.id, DiscoverySearch.enabled.is_(True))
            .order_by(DiscoverySearch.created_at)
        ).scalars()
    )
    if not searches:
        return summary

    vocab, resume_text = discovery_service.resume_vocabulary(session, ws.id)
    for search in searches:
        try:
            result = discovery_service.run_search(session, search, vocab)
        except Exception as e:
            logger.exception("discovery search %s failed", search.id)
            session.rollback()
            search = session.get(DiscoverySearch, search.id)
            if search is not None:
                search.last_run_at = datetime.now(timezone.utc)
                search.last_status = "failed"
                search.last_error = redact(f"{type(e).__name__}: {e}")
            session.commit()
            continue
        session.commit()
        summary["searches"] += 1
        summary["new"] += sum(r.get("new", 0) for r in result.values() if r.get("ok"))

    try:
        scoring = _score(loop, ws, resume_text, "; ".join(s.search_term for s in searches))
        summary["scored"] = scoring["scored"]
        summary["scoring_stopped"] = scoring["stopped"]
    except Exception:
        logger.exception("discovery scoring failed for workspace %s", ws.id)
        summary["scoring_stopped"] = "error"
    return summary


@celery_app.task(name="app.tasks.discovery.run_all_discovery")
def run_all_discovery() -> dict:
    """Beat entry: every workspace that opted in, at most once per day each."""
    summary = {"workspaces": 0, "ran": 0, "skipped_duplicate": 0, "new": 0, "failed": 0}
    if not settings.FEATURE_DISCOVERY:
        return {**summary, "error": "feature_off"}

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    engine = create_engine(settings.DATABASE_URL_SYNC)
    loop = asyncio.new_event_loop()
    try:
        with Session(engine) as session:
            workspaces = list(
                session.execute(
                    select(Workspace)
                    .join(WorkspaceSettings, WorkspaceSettings.workspace_id == Workspace.id)
                    .where(WorkspaceSettings.discovery_enabled.is_(True))
                    .order_by(Workspace.created_at)
                ).scalars()
            )
            for ws in workspaces:
                summary["workspaces"] += 1
                claim = f"discovery:{ws.id}:{today}"
                if not ratelimit.claim_once(claim, DEDUPE_TTL_S):
                    summary["skipped_duplicate"] += 1
                    continue
                try:
                    result = run_workspace(session, loop, ws)
                    summary["ran"] += 1
                    summary["new"] += result["new"]
                except Exception:
                    logger.exception("discovery failed for workspace %s", ws.id)
                    session.rollback()
                    summary["failed"] += 1
                    ratelimit.release_claim(claim)  # let a retry/redelivery try again
    finally:
        loop.close()
        engine.dispose()
    logger.info("discovery summary: %s", summary)
    return summary


@celery_app.task(name="app.tasks.discovery.run_discovery_for_workspace")
def run_discovery_for_workspace(workspace_id: str) -> dict:
    """The "Run now" button: an explicit request, so it ignores the per-workspace opt-in and the
    once-a-day guard, but never overlaps another run of the same workspace."""
    if not settings.FEATURE_DISCOVERY:
        return {"error": "feature_off"}
    lock = f"discovery-run:{workspace_id}"
    if not ratelimit.claim_once(lock, RUN_LOCK_TTL_S):
        return {"error": "already_running"}
    engine = create_engine(settings.DATABASE_URL_SYNC)
    loop = asyncio.new_event_loop()
    try:
        with Session(engine) as session:
            ws = session.get(Workspace, uuid.UUID(workspace_id))
            if ws is None:
                return {"error": "workspace_not_found"}
            return run_workspace(session, loop, ws)
    finally:
        ratelimit.release_claim(lock)
        loop.close()
        engine.dispose()


@celery_app.task(name="app.tasks.discovery.cleanup_discovery")
def cleanup_discovery() -> dict:
    """Daily: drop un-triaged postings past the retention window (dismissed/added rows stay)."""
    if not settings.FEATURE_DISCOVERY:
        return {"deleted": 0, "error": "feature_off"}
    engine = create_engine(settings.DATABASE_URL_SYNC)
    try:
        with Session(engine) as session:
            deleted = discovery_service.cleanup_old(session)
            session.commit()
    finally:
        engine.dispose()
    logger.info("discovery cleanup removed %s stale postings", deleted)
    return {"deleted": deleted}
