"""The contract every discovery source implements.

A source turns a saved search into plain `RawPosting`s. Nothing else in discovery knows how a
board is scraped, so a new source (an ATS feed, a country job portal) is one module plus one
`register()` call, and a broken scraper can fail without taking the others down.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class RawPosting:
    """One posting as a source reports it. Plain Python types only (no pandas/NaN leaks out)."""

    title: str
    url: str
    company: str = ""
    location: str | None = None
    description: str = ""
    date_posted: date | None = None
    salary_text: str | None = None
    is_remote: bool | None = None


class SourceError(Exception):
    """A source failed in a way worth showing the user (blocked, rate limited, bad input)."""


@runtime_checkable
class DiscoverySource(Protocol):
    name: str  # stable id stored in discovery_searches.sites and discovered_jobs.source
    label: str  # shown in the UI
    requires_country: bool  # needs the search's `country` (Indeed / Glassdoor)
    india_only: bool  # only meaningful for Indian locations (Naukri)
    needs_proxy_hint: bool  # tends to be blocked from datacentre IPs without a proxy

    def fetch(self, search: "SearchSpec") -> list[RawPosting]: ...


@dataclass(frozen=True)
class SearchSpec:
    """What a source needs from a saved search (a detached copy: no ORM objects cross over)."""

    search_term: str
    location: str | None
    country: str | None
    is_remote: bool
    hours_old: int
    results_wanted: int
