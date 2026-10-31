"""Discovery, API side (async): saved searches, the inbox listing, and triage.

Adding a posting to the board goes through `ingest_job(actor="discovery")`, the same path as the
Chrome extension, so it lands as a Saved card and is deduped against existing jobs by URL.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.discovery import (
    DISCOVERED_ADDED,
    DISCOVERED_DISMISSED,
    DISCOVERED_NEW,
    DiscoveredJob,
    DiscoverySearch,
)
from app.models.workspace_settings import WorkspaceSettings
from app.services import ingest, workspace_settings as settings_service
from app.services.discovery import MAX_SEARCHES_PER_WORKSPACE, validate_search


class SearchLimitError(Exception):
    pass


# --------------------------------------------------------------------------- searches
async def list_searches(db: AsyncSession, ws_id: uuid.UUID) -> list[DiscoverySearch]:
    rows = await db.execute(
        select(DiscoverySearch).where(DiscoverySearch.workspace_id == ws_id).order_by(DiscoverySearch.created_at)
    )
    return list(rows.scalars())


async def get_search(db: AsyncSession, ws_id: uuid.UUID, search_id: uuid.UUID) -> DiscoverySearch | None:
    return (
        await db.execute(
            select(DiscoverySearch).where(DiscoverySearch.id == search_id, DiscoverySearch.workspace_id == ws_id)
        )
    ).scalar_one_or_none()


async def create_search(db: AsyncSession, ws_id: uuid.UUID, data: dict) -> DiscoverySearch:
    count = (
        await db.execute(select(func.count()).select_from(DiscoverySearch).where(DiscoverySearch.workspace_id == ws_id))
    ).scalar_one()
    if count >= MAX_SEARCHES_PER_WORKSPACE:
        raise SearchLimitError(f"You can keep up to {MAX_SEARCHES_PER_WORKSPACE} saved searches.")
    data = dict(data)
    data["sites"], data["country"] = validate_search(data["sites"], data.get("location"), data.get("country"))
    search = DiscoverySearch(workspace_id=ws_id, **data)
    db.add(search)
    await db.flush()
    return search


async def update_search(db: AsyncSession, search: DiscoverySearch, changes: dict) -> DiscoverySearch:
    merged = {
        "sites": search.sites,
        "location": search.location,
        "country": search.country,
        **{k: v for k, v in changes.items() if k in ("sites", "location", "country")},
    }
    sites, country = validate_search(merged["sites"], merged["location"], merged["country"])
    not_nullable = ("name", "search_term", "sites", "is_remote", "hours_old", "results_wanted", "enabled")
    for key, value in changes.items():
        if value is None and key in not_nullable:
            continue
        setattr(search, key, value)
    search.sites, search.country = sites, country
    await db.flush()
    return search


# --------------------------------------------------------------------------- inbox
def _order():
    best = func.coalesce(DiscoveredJob.fit_score, DiscoveredJob.keyword_score)
    return (best.desc(), DiscoveredJob.date_posted.desc().nulls_last(), DiscoveredJob.first_seen_at.desc())


async def list_jobs(
    db: AsyncSession,
    ws_id: uuid.UUID,
    *,
    state: str = DISCOVERED_NEW,
    source: str | None = None,
    min_fit: int | None = None,
    search_text: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[DiscoveredJob], int]:
    conditions = [DiscoveredJob.workspace_id == ws_id, DiscoveredJob.state == state]
    if source:
        conditions.append(DiscoveredJob.source == source)
    if min_fit is not None:
        conditions.append(func.coalesce(DiscoveredJob.fit_score, DiscoveredJob.keyword_score) >= min_fit)
    if search_text:
        like = f"%{search_text.strip()[:100]}%"
        conditions.append(or_(DiscoveredJob.title.ilike(like), DiscoveredJob.company.ilike(like)))
    total = (await db.execute(select(func.count()).select_from(DiscoveredJob).where(*conditions))).scalar_one()
    rows = await db.execute(select(DiscoveredJob).where(*conditions).order_by(*_order()).limit(limit).offset(offset))
    return list(rows.scalars()), total


async def _owned(db: AsyncSession, ws_id: uuid.UUID, ids: list[uuid.UUID]) -> list[DiscoveredJob]:
    rows = await db.execute(select(DiscoveredJob).where(DiscoveredJob.workspace_id == ws_id, DiscoveredJob.id.in_(ids)))
    return list(rows.scalars())


async def add_to_board(db: AsyncSession, ws_id: uuid.UUID, ids: list[uuid.UUID]) -> dict:
    """Save postings as board cards. Raises ingest.NoBoardError if the workspace has no board."""
    found = await _owned(db, ws_id, ids)
    done = duplicates = 0
    for job in found:
        if job.state == DISCOVERED_ADDED:
            continue
        result = await ingest.ingest_job(
            db, ws_id,
            company=job.company or "Unknown company",
            title=job.title,
            url=job.url,
            description=job.description,
            location=job.location,
            source_hint=job.source,
            actor="discovery",
        )
        job.state = DISCOVERED_ADDED
        job.added_job_id = result.job_id
        done += 1
        duplicates += int(result.duplicate)
    await db.flush()
    return {"done": done, "duplicates": duplicates, "missing": len(set(ids)) - len(found)}


async def dismiss(db: AsyncSession, ws_id: uuid.UUID, ids: list[uuid.UUID]) -> dict:
    found = await _owned(db, ws_id, ids)
    done = 0
    for job in found:
        if job.state == DISCOVERED_NEW:
            job.state = DISCOVERED_DISMISSED
            done += 1
    await db.flush()
    return {"done": done, "duplicates": 0, "missing": len(set(ids)) - len(found)}


# --------------------------------------------------------------------------- settings / status
async def discovery_enabled(db: AsyncSession, ws_id: uuid.UUID) -> bool:
    row = (
        await db.execute(select(WorkspaceSettings.discovery_enabled).where(WorkspaceSettings.workspace_id == ws_id))
    ).scalar_one_or_none()
    return bool(row)


async def set_enabled(db: AsyncSession, ws_id: uuid.UUID, enabled: bool) -> None:
    await settings_service.update_settings(db, ws_id, discovery_enabled=enabled)


async def status(db: AsyncSession, ws_id: uuid.UUID) -> dict:
    counts = dict(
        (
            await db.execute(
                select(DiscoveredJob.state, func.count()).where(DiscoveredJob.workspace_id == ws_id).group_by(DiscoveredJob.state)
            )
        ).all()
    )
    last_run = (
        await db.execute(select(func.max(DiscoverySearch.last_run_at)).where(DiscoverySearch.workspace_id == ws_id))
    ).scalar_one()
    unscored = (
        await db.execute(
            select(func.count()).select_from(DiscoveredJob).where(
                DiscoveredJob.workspace_id == ws_id,
                DiscoveredJob.state == DISCOVERED_NEW,
                DiscoveredJob.fit_score.is_(None),
            )
        )
    ).scalar_one()
    return {
        "enabled": await discovery_enabled(db, ws_id),
        "new_count": counts.get(DISCOVERED_NEW, 0),
        "added_count": counts.get(DISCOVERED_ADDED, 0),
        "dismissed_count": counts.get(DISCOVERED_DISMISSED, 0),
        "last_run_at": last_run,
        "ai_scored_pending": unscored,
        "proxy_configured": bool(settings.discovery_proxies),
    }
