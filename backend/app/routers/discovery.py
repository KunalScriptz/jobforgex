"""Discovery: saved searches, the scraped-jobs inbox, and triage. Behind FEATURE_DISCOVERY."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies.workspace import current_workspace_id
from app.schemas.discovery import (
    BulkAction,
    BulkResult,
    DiscoveredJobList,
    DiscoveredJobOut,
    DiscoveryOptions,
    DiscoverySettingsIn,
    DiscoveryStatus,
    SearchCreate,
    SearchOut,
    SearchUpdate,
)
from app.models.discovery import DISCOVERED_STATES
from app.services import discovery_inbox as inbox
from app.services import ratelimit
from app.services.discovery import HOURS_OLD_RANGE, MAX_SEARCHES_PER_WORKSPACE, RESULTS_WANTED_RANGE
from app.services.discovery_sources import COUNTRIES, all_sources
from app.services.ingest import NoBoardError

RUN_NOW_LIMIT = 4  # per workspace per hour: a scrape is slow and boards block abusive callers
RUN_NOW_WINDOW_S = 3600


async def require_discovery_enabled() -> None:
    if not settings.FEATURE_DISCOVERY:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discovery is not enabled")


router = APIRouter(
    prefix="/api/v1/discovery", tags=["discovery"], dependencies=[Depends(require_discovery_enabled)]
)


@router.get("/options", response_model=DiscoveryOptions)
async def options(_: uuid.UUID = Depends(current_workspace_id)):
    return DiscoveryOptions(
        sources=[
            dict(name=s.name, label=s.label, requires_country=s.requires_country,
                 india_only=s.india_only, needs_proxy_hint=s.needs_proxy_hint)
            for s in all_sources()
        ],
        countries=list(COUNTRIES),
        max_searches=MAX_SEARCHES_PER_WORKSPACE,
        hours_old_range=HOURS_OLD_RANGE,
        results_wanted_range=RESULTS_WANTED_RANGE,
    )


@router.get("/status", response_model=DiscoveryStatus)
async def get_status(ws_id: uuid.UUID = Depends(current_workspace_id), db: AsyncSession = Depends(get_db)):
    return await inbox.status(db, ws_id)


@router.put("/settings", response_model=DiscoveryStatus)
async def put_settings(
    data: DiscoverySettingsIn, ws_id: uuid.UUID = Depends(current_workspace_id), db: AsyncSession = Depends(get_db)
):
    await inbox.set_enabled(db, ws_id, data.enabled)
    return await inbox.status(db, ws_id)


# --------------------------------------------------------------------------- searches
@router.get("/searches", response_model=list[SearchOut])
async def list_searches(ws_id: uuid.UUID = Depends(current_workspace_id), db: AsyncSession = Depends(get_db)):
    return await inbox.list_searches(db, ws_id)


@router.post("/searches", response_model=SearchOut, status_code=status.HTTP_201_CREATED)
async def create_search(
    data: SearchCreate, ws_id: uuid.UUID = Depends(current_workspace_id), db: AsyncSession = Depends(get_db)
):
    try:
        return await inbox.create_search(db, ws_id, data.model_dump())
    except inbox.SearchLimitError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.put("/searches/{search_id}", response_model=SearchOut)
async def update_search(
    search_id: uuid.UUID,
    data: SearchUpdate,
    ws_id: uuid.UUID = Depends(current_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    search = await inbox.get_search(db, ws_id, search_id)
    if search is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search not found")
    try:
        return await inbox.update_search(db, search, data.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.delete("/searches/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_search(
    search_id: uuid.UUID, ws_id: uuid.UUID = Depends(current_workspace_id), db: AsyncSession = Depends(get_db)
):
    search = await inbox.get_search(db, ws_id, search_id)
    if search is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search not found")
    await db.delete(search)


# --------------------------------------------------------------------------- inbox
@router.get("/jobs", response_model=DiscoveredJobList)
async def list_jobs(
    state: str = Query("new"),
    source: str | None = None,
    min_fit: int | None = Query(None, ge=0, le=100),
    q: str | None = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    ws_id: uuid.UUID = Depends(current_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    if state not in DISCOVERED_STATES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown state '{state}'")
    items, total = await inbox.list_jobs(
        db, ws_id, state=state, source=source, min_fit=min_fit, search_text=q, limit=limit, offset=offset
    )
    return DiscoveredJobList(items=[DiscoveredJobOut.model_validate(i) for i in items], total=total)


@router.post("/jobs/bulk", response_model=BulkResult)
async def bulk(data: BulkAction, ws_id: uuid.UUID = Depends(current_workspace_id), db: AsyncSession = Depends(get_db)):
    try:
        if data.action == "add":
            return await inbox.add_to_board(db, ws_id, data.ids)
        return await inbox.dismiss(db, ws_id, data.ids)
    except NoBoardError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Create a board before adding jobs")


@router.post("/jobs/{job_id}/add", response_model=BulkResult)
async def add_one(job_id: uuid.UUID, ws_id: uuid.UUID = Depends(current_workspace_id), db: AsyncSession = Depends(get_db)):
    try:
        result = await inbox.add_to_board(db, ws_id, [job_id])
    except NoBoardError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Create a board before adding jobs")
    if result["missing"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discovered job not found")
    return result


@router.post("/jobs/{job_id}/dismiss", response_model=BulkResult)
async def dismiss_one(job_id: uuid.UUID, ws_id: uuid.UUID = Depends(current_workspace_id), db: AsyncSession = Depends(get_db)):
    result = await inbox.dismiss(db, ws_id, [job_id])
    if result["missing"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discovered job not found")
    return result


# --------------------------------------------------------------------------- run now
@router.post("/run", status_code=status.HTTP_202_ACCEPTED)
async def run_now(ws_id: uuid.UUID = Depends(current_workspace_id), db: AsyncSession = Depends(get_db)):
    """Queue a discovery run for this workspace now (the same task the daily schedule uses)."""
    if not [s for s in await inbox.list_searches(db, ws_id) if s.enabled]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Add a search first")
    if not await ratelimit.allow(f"discovery-run:{ws_id}", RUN_NOW_LIMIT, RUN_NOW_WINDOW_S):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many runs: try again later")
    from app.tasks.discovery import run_discovery_for_workspace

    run_discovery_for_workspace.delay(str(ws_id))
    return {"queued": True}
