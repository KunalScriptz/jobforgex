"""Registry of discovery sources. To add one: implement `DiscoverySource` and `register()` it here."""
from __future__ import annotations

from app.services.discovery_sources.base import DiscoverySource, RawPosting, SearchSpec, SourceError
from app.services.discovery_sources.countries import COUNTRIES, normalize_country
from app.services.discovery_sources.jobspy_source import JobSpySource, location_in_india, redact

_REGISTRY: dict[str, DiscoverySource] = {}


def register(source: DiscoverySource) -> None:
    _REGISTRY[source.name] = source


def get_source(name: str) -> DiscoverySource | None:
    return _REGISTRY.get(name)


def all_sources() -> list[DiscoverySource]:
    return list(_REGISTRY.values())


# JobSpy boards. (Google Jobs is left out: JobSpy's own FAQ says it is currently unavailable.)
register(JobSpySource("indeed", "Indeed", requires_country=True))
register(JobSpySource("naukri", "Naukri", india_only=True))
register(JobSpySource("linkedin", "LinkedIn", needs_proxy_hint=True))
register(JobSpySource("glassdoor", "Glassdoor", requires_country=True, needs_proxy_hint=True))

__all__ = [
    "COUNTRIES", "DiscoverySource", "JobSpySource", "RawPosting", "SearchSpec", "SourceError",
    "all_sources", "get_source", "location_in_india", "normalize_country", "redact", "register",
]
