"""Discovery core (sync side): validate a saved search, run it through the registered sources,
dedupe, score cheaply and store the results in the workspace's inbox.

Runs inside Celery (sync SQLAlchemy session). The API side (CRUD, listing, add/dismiss) lives in
`discovery_inbox.py`; AI fit scoring is `discovery_scoring.py`.

De-duplication: a posting is skipped when its normalised URL hash already exists as a job card
(saved / applied / anything) or in the inbox (including dismissed ones, so a dismissed posting is
never suggested again). A posting whose company+title+location was already seen from another
board is stored but flagged `possible_duplicate`.
"""
from __future__ import annotations

import logging
import random
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Callable

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import settings
from app.models.discovery import DISCOVERED_NEW, DiscoveredJob, DiscoverySearch
from app.models.job import Job
from app.models.resume import Resume
from app.services import job_url
from app.services.discovery_sources import (
    RawPosting,
    SearchSpec,
    SourceError,
    get_source,
    location_in_india,
    normalize_country,
    redact,
)

logger = logging.getLogger(__name__)

MAX_SEARCHES_PER_WORKSPACE = 10
HOURS_OLD_RANGE = (1, 24 * 30)
RESULTS_WANTED_RANGE = (5, 100)

_STOPWORDS = frozenset(
    "the and for with from that this you your our are will have has can all any not but out who "
    "about into over per job work team role years year experience skills ability strong good "
    "well new more other their they them etc using use used such also may must should".split()
)
_TOKEN_RE = re.compile(r"[a-z][a-z0-9+#.]{1,}")


# --------------------------------------------------------------------------- validation
def validate_search(sites: list[str], location: str | None, country: str | None) -> tuple[list[str], str | None]:
    """Check a search's sources against its location/country. Returns (sites, canonical country).

    Raises ValueError with a message safe to show the user."""
    clean_sites: list[str] = []
    for name in sites:
        name = (name or "").strip().lower()
        if name and name not in clean_sites:
            clean_sites.append(name)
    if not clean_sites:
        raise ValueError("Pick at least one source.")
    canonical_country = normalize_country(country)
    for name in clean_sites:
        source = get_source(name)
        if source is None:
            raise ValueError(f"Unknown source: {name}")
        if source.requires_country and not canonical_country:
            raise ValueError(f"{source.label} needs a country (it defaults to the USA otherwise).")
        if source.india_only and not location_in_india(location, canonical_country):
            raise ValueError(f"{source.label} only covers India: set an Indian location or country.")
    return clean_sites, canonical_country


def spec_of(search: DiscoverySearch) -> SearchSpec:
    return SearchSpec(
        search_term=search.search_term,
        location=search.location,
        country=search.country,
        is_remote=bool(search.is_remote),
        hours_old=search.hours_old,
        results_wanted=search.results_wanted,
    )


# --------------------------------------------------------------------------- cheap scoring
def tokens(text: str | None) -> set[str]:
    return {t for t in _TOKEN_RE.findall((text or "").lower()) if t not in _STOPWORDS and len(t) >= 2}


def keyword_score(title: str, description: str, search_term: str, resume_vocab: set[str]) -> int:
    """0-100 overlap score, no AI: how much of the search term the title contains (60), how much
    the description repeats it (10), and how much of the posting's vocabulary the resume shares (30)."""
    term = tokens(search_term)
    title_tokens = tokens(title)
    desc_tokens = tokens((description or "")[:4000])
    score = 0.0
    if term:
        score += 60 * len(term & title_tokens) / len(term)
        score += 10 * len(term & desc_tokens) / len(term)
    if resume_vocab:
        posting = title_tokens | desc_tokens
        if posting:
            ratio = len(posting & resume_vocab) / len(posting)
            score += 30 * min(1.0, ratio / 0.4)
    return max(0, min(100, round(score)))


def resume_vocabulary(session: Session, workspace_id: uuid.UUID) -> tuple[set[str], str]:
    """(vocabulary, plain text) of the workspace's base resume; empty if it has none yet."""
    from app.services.ai import _latex_to_plain_text

    latex = session.execute(
        select(Resume.latex_source)
        .where(Resume.workspace_id == workspace_id)
        .order_by(Resume.is_base.desc(), Resume.is_default.desc(), Resume.created_at)
        .limit(1)
    ).scalar_one_or_none()
    text = _latex_to_plain_text(latex or "")
    return tokens(text), text


# --------------------------------------------------------------------------- storing
def store_postings(
    session: Session,
    workspace_id: uuid.UUID,
    search_id: uuid.UUID,
    source: str,
    postings: list[RawPosting],
    *,
    search_term: str,
    resume_vocab: set[str],
) -> int:
    """Insert new postings into the inbox; returns how many were actually new."""
    prepared: dict[str, dict] = {}
    for p in postings:
        h = job_url.url_hash(p.url)
        if not h or h in prepared:
            continue
        detected = job_url.detect_source(p.url, source)
        prepared[h] = {
            "id": uuid.uuid4(),
            "workspace_id": workspace_id,
            "search_id": search_id,
            "source": detected if detected != "web" else source,
            "title": p.title,
            "company": p.company,
            "location": p.location,
            "url": job_url.normalize_url(p.url) or p.url,
            "description": p.description,
            "date_posted": p.date_posted,
            "salary_text": p.salary_text,
            "is_remote": p.is_remote,
            "url_hash": h,
            "content_hash": job_url.content_hash(p.company, p.title, p.location),
            "keyword_score": keyword_score(p.title, p.description, search_term, resume_vocab),
            "state": DISCOVERED_NEW,
        }
    if not prepared:
        return 0

    hashes = list(prepared)
    known = set(session.execute(select(Job.url_hash).where(Job.workspace_id == workspace_id, Job.url_hash.in_(hashes))).scalars())
    known |= set(
        session.execute(
            select(DiscoveredJob.url_hash).where(DiscoveredJob.workspace_id == workspace_id, DiscoveredJob.url_hash.in_(hashes))
        ).scalars()
    )
    fresh = [row for h, row in prepared.items() if h not in known]
    if not fresh:
        return 0

    content_hashes = list({r["content_hash"] for r in fresh})
    seen_content = set(
        session.execute(select(Job.content_hash).where(Job.workspace_id == workspace_id, Job.content_hash.in_(content_hashes))).scalars()
    ) | set(
        session.execute(
            select(DiscoveredJob.content_hash).where(
                DiscoveredJob.workspace_id == workspace_id, DiscoveredJob.content_hash.in_(content_hashes)
            )
        ).scalars()
    )
    for row in fresh:
        row["possible_duplicate"] = row["content_hash"] in seen_content

    # ON CONFLICT DO NOTHING: two overlapping runs can't create the same posting twice.
    result = session.execute(
        pg_insert(DiscoveredJob).values(fresh).on_conflict_do_nothing(index_elements=["workspace_id", "url_hash"])
    )
    return result.rowcount or 0


# --------------------------------------------------------------------------- running
def run_search(
    session: Session,
    search: DiscoverySearch,
    resume_vocab: set[str],
    *,
    sleep: Callable[[float], None] = time.sleep,
) -> dict:
    """Run one saved search through each of its sources and record the outcome on the search.

    Every source is isolated: one that is blocked or raises is reported and the rest still run."""
    spec = spec_of(search)
    result: dict[str, dict] = {}
    for index, name in enumerate(search.sites or []):
        source = get_source(name)
        if source is None:
            result[name] = {"ok": False, "error": "Unknown source"}
            continue
        if index:
            sleep(random.uniform(1.0, 3.0))  # be polite between boards
        try:
            postings = source.fetch(spec)
            added = store_postings(
                session, search.workspace_id, search.id, name, postings,
                search_term=search.search_term, resume_vocab=resume_vocab,
            )
            result[name] = {"ok": True, "found": len(postings), "new": added}
        except SourceError as e:
            result[name] = {"ok": False, "error": redact(e)}
        except Exception as e:  # a scraper bug must not abort the other boards
            logger.exception("discovery source %s crashed", name)
            result[name] = {"ok": False, "error": redact(f"{type(e).__name__}: {e}")}

    oks = [r["ok"] for r in result.values()]
    search.last_run_at = datetime.now(timezone.utc)
    search.last_result = result
    search.last_status = "ok" if oks and all(oks) else ("failed" if not any(oks) else "partial")
    errors = [f"{n}: {r['error']}" for n, r in result.items() if not r["ok"]]
    search.last_error = "; ".join(errors)[:1000] or None
    session.flush()
    return result


def cleanup_old(session: Session, *, now: datetime | None = None) -> int:
    """Drop un-triaged postings older than the retention window. Dismissed and added rows stay:
    they are the memory that stops a posting being suggested twice."""
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=settings.DISCOVERY_RETENTION_DAYS)
    result = session.execute(
        delete(DiscoveredJob).where(DiscoveredJob.state == DISCOVERED_NEW, DiscoveredJob.first_seen_at < cutoff)
    )
    return result.rowcount or 0
