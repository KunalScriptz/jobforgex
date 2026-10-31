"""JobSpy (https://github.com/speedyapply/JobSpy) as a discovery source.

This is the only module that imports `jobspy`. It scrapes ONE board per call, so a failure on one
board never takes another down, and it converts the DataFrame into plain `RawPosting`s (NaN/NaT
become None). Proxy credentials are scrubbed from every error before it can reach a log or the
`last_error` column.
"""
from __future__ import annotations

import logging
from datetime import date, datetime

from app.config import settings
from app.services.discovery_sources.base import RawPosting, SearchSpec, SourceError

logger = logging.getLogger(__name__)

_INDIA_MARKERS = (
    "india", "bengaluru", "bangalore", "mumbai", "delhi", "ncr", "gurgaon", "gurugram", "noida",
    "hyderabad", "chennai", "pune", "kolkata", "ahmedabad", "jaipur", "kochi", "cochin",
    "coimbatore", "thiruvananthapuram", "trivandrum", "chandigarh", "indore", "lucknow",
    "nagpur", "bhubaneswar", "vadodara", "surat", "visakhapatnam", "mysuru", "mysore",
)


def location_in_india(location: str | None, country: str | None = None) -> bool:
    """Heuristic used to offer/accept Naukri (an India-only board)."""
    if (country or "").strip().lower() == "india":
        return True
    text = (location or "").lower()
    return any(marker in text for marker in _INDIA_MARKERS)


def redact(message: object) -> str:
    """Strip proxy URLs / credentials out of an error message."""
    text = str(message)
    for proxy in settings.discovery_proxies:
        text = text.replace(proxy, "[proxy]")
        # also the bare user:pass part, in case a library echoes only the credentials
        creds = proxy.split("://", 1)[-1].rsplit("@", 1)
        if len(creds) == 2 and creds[0]:
            text = text.replace(creds[0], "[credentials]")
    return text[:500]


def _clean(value: object) -> object:
    """NaN / NaT / pandas NA -> None; numpy scalars -> Python scalars."""
    try:
        import pandas as pd

        if value is None or (not isinstance(value, (list, dict, str)) and pd.isna(value)):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "item") and not isinstance(value, (str, bytes)):
        try:
            return value.item()
        except (ValueError, AttributeError):
            return value
    return value


def _as_date(value: object) -> date | None:
    value = _clean(value)
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _salary_text(row: dict) -> str | None:
    low, high = _clean(row.get("min_amount")), _clean(row.get("max_amount"))
    if low is None and high is None:
        return None
    currency = _clean(row.get("currency")) or ""
    interval = _clean(row.get("interval")) or ""

    def fmt(n: object) -> str:
        return f"{float(n):,.0f}"  # type: ignore[arg-type]

    span = fmt(low) if high is None or low == high else (fmt(high) if low is None else f"{fmt(low)}-{fmt(high)}")
    return " ".join(part for part in (str(currency), span, f"/{interval}" if interval else "") if part)[:120]


def rows_to_postings(rows: list[dict]) -> list[RawPosting]:
    """Convert JobSpy records (already NaN-cleaned or not) into RawPostings, dropping unusable ones."""
    out: list[RawPosting] = []
    for raw in rows:
        row = {k: _clean(v) for k, v in raw.items()}
        # The board's own page (not the employer's direct apply link): it matches what the Chrome
        # extension saves, so the same posting dedupes against jobs the user already has.
        url = row.get("job_url")
        title = (row.get("title") or "").strip()
        if not url or not title:
            continue
        out.append(
            RawPosting(
                title=title[:300],
                url=str(url)[:1000],
                company=str(row.get("company") or "").strip()[:200],
                location=(str(row["location"])[:300] if row.get("location") else None),
                description=str(row.get("description") or ""),
                date_posted=_as_date(row.get("date_posted")),
                salary_text=_salary_text(row),
                is_remote=row.get("is_remote") if isinstance(row.get("is_remote"), bool) else None,
            )
        )
    return out


class JobSpySource:
    """One JobSpy board. Instances are registered per site name."""

    def __init__(self, name: str, label: str, *, requires_country=False, india_only=False, needs_proxy_hint=False):
        self.name = name
        self.label = label
        self.requires_country = requires_country
        self.india_only = india_only
        self.needs_proxy_hint = needs_proxy_hint

    def fetch(self, search: SearchSpec) -> list[RawPosting]:
        try:
            from jobspy import scrape_jobs  # imported lazily: pandas is heavy and the API never needs it
        except ImportError as e:  # pragma: no cover - the dependency is declared
            raise SourceError("python-jobspy is not installed") from e

        kwargs: dict = dict(
            site_name=[self.name],
            search_term=search.search_term,
            location=search.location or None,
            results_wanted=search.results_wanted,
            hours_old=search.hours_old,
            is_remote=search.is_remote,
            description_format="markdown",
            fetch_description=True,
            verbose=0,
        )
        if self.requires_country and search.country:
            kwargs["country_indeed"] = search.country
        proxies = settings.discovery_proxies
        if proxies:
            kwargs["proxies"] = proxies

        try:
            df = scrape_jobs(**kwargs)
        except Exception as e:  # JobSpy raises ValueError for bad args and arbitrary errors for blocks
            raise SourceError(redact(e)) from None

        errors = getattr(df, "attrs", {}).get("errors") or {}
        if errors.get(self.name) and len(df) == 0:
            raise SourceError(redact(errors[self.name]))
        if len(df) == 0:
            return []
        # Missing fields come back as NaN/NaT, not None: normalise before anything touches them.
        df = df.astype(object).where(df.notna(), None)
        return rows_to_postings(df.to_dict(orient="records"))
