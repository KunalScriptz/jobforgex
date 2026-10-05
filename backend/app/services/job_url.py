"""Job URL normalisation, de-duplication hashes and source detection.

`normalize_url` is deliberately conservative. It only removes things that can never identify a
different posting (scheme, `www.`, fragments, tracking parameters, trailing slashes) and collapses a
few boards whose URLs are known to carry the job id in a predictable place. The failure mode is
therefore "the same job is saved twice under two hashes", never "two different jobs are merged".

The migration `0003_tracking_core` imports this module to back-fill existing rows, so old rows and
new rows are always hashed by the same code. Changing the normalisation later means existing hashes
no longer match new ones: ship a re-hash migration with it.
"""
from __future__ import annotations

import hashlib
import re
from urllib.parse import parse_qsl, urlencode, urlsplit

# Query parameters that only record *how you arrived*, never *which job*.
_TRACKING_PARAMS = frozenset({
    "gclid", "fbclid", "msclkid", "igshid", "mc_cid", "mc_eid", "_hsenc", "_hsmi",
    "ref", "refid", "referrer", "trk", "trkinfo", "trkemail", "trackingid", "tracking_id",
    "src", "source", "from", "origin", "lipi", "midtoken", "midsig", "ebp", "vjs", "advn", "adid",
})

# ATS / careers hosts where the path alone identifies the posting, so the whole query is noise.
_PATH_IDENTIFIES_HOSTS = (
    "greenhouse.io", "lever.co", "ashbyhq.com", "workable.com", "smartrecruiters.com",
    "myworkdayjobs.com", "icims.com", "jobvite.com", "bamboohr.com",
)

_LINKEDIN_JOB_RE = re.compile(r"/jobs/view/(?:[^/?#]*-)?(\d{6,})")

# (domain suffix, source). Matched against the full host, most specific first.
_DOMAIN_SOURCES = (
    ("linkedin.com", "linkedin"),
    ("wellfound.com", "wellfound"),
    ("angel.co", "wellfound"),
    ("naukri.com", "naukri"),
    ("greenhouse.io", "greenhouse"),
    ("lever.co", "lever"),
    ("ashbyhq.com", "ashby"),
    ("myworkdayjobs.com", "workday"),
    ("workable.com", "workable"),
    ("smartrecruiters.com", "smartrecruiters"),
    ("weworkremotely.com", "weworkremotely"),
    ("instahyre.com", "instahyre"),
    ("cutshort.io", "cutshort"),
    ("bayt.com", "bayt"),
    ("remoteok.com", "remoteok"),
    ("remoteok.io", "remoteok"),
)
# Boards that run on many country domains (in.indeed.com, jobstreet.com.my, glassdoor.co.in ...):
# matched on the registrable label rather than the whole domain.
_LABEL_SOURCES = {
    "indeed": "indeed",
    "glassdoor": "glassdoor",
    "jobstreet": "jobstreet",
    "ziprecruiter": "ziprecruiter",
    "monster": "monster",
    "foundit": "foundit",
    "hirist": "hirist",
    "seek": "seek",
}

KNOWN_SOURCES = frozenset(
    {s for _, s in _DOMAIN_SOURCES} | set(_LABEL_SOURCES.values()) | {"manual", "web"}
)


def _host_of(url: str) -> str | None:
    try:
        host = (urlsplit(url).hostname or "").lower().rstrip(".")
    except ValueError:
        return None
    if host.startswith("www."):
        host = host[4:]
    return host or None


# "mailto:x", "javascript:x", "tel:x" ... but not "example.com:8080/path" (a host and port).
_OPAQUE_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:(?!\d+(?:[/?#]|$))")


def _with_scheme(raw: str) -> str | None:
    """Add https:// to a bare host/path; None for opaque schemes that can never be a job page."""
    if "://" in raw:
        return raw
    if _OPAQUE_SCHEME_RE.match(raw):
        return None
    return f"https://{raw}"


def normalize_url(raw: str | None) -> str | None:
    """Canonical form of a job URL, or None when it isn't a usable http(s) URL."""
    if not raw or not raw.strip():
        return None
    candidate = _with_scheme(raw.strip())
    if candidate is None:
        return None
    try:
        parts = urlsplit(candidate)
    except ValueError:
        return None
    if parts.scheme.lower() not in ("http", "https"):
        return None
    host = _host_of(parts.geturl())
    if not host or "." not in host:
        return None

    path = re.sub(r"/{2,}", "/", parts.path or "/")
    query = parse_qsl(parts.query, keep_blank_values=False)
    qdict = {k.lower(): v for k, v in query}

    if host == "linkedin.com" or host.endswith(".linkedin.com"):
        m = _LINKEDIN_JOB_RE.search(path)
        job_id = m.group(1) if m else (qdict.get("currentjobid") or "")
        if job_id.isdigit():
            return f"https://linkedin.com/jobs/view/{job_id}"
        host = "linkedin.com"

    labels = host.split(".")
    if "indeed" in labels[-3:-1]:
        job_key = qdict.get("jk") or qdict.get("vjk")
        if job_key:
            return f"https://{host}/viewjob?jk={job_key}"

    if any(host == h or host.endswith("." + h) for h in _PATH_IDENTIFIES_HOSTS):
        kept = [(k, v) for k, v in query if k.lower() == "gh_jid"]
    else:
        kept = [
            (k, v) for k, v in query
            if k.lower() not in _TRACKING_PARAMS and not k.lower().startswith("utm_")
        ]
    kept.sort()

    if len(path) > 1:
        path = path.rstrip("/") or "/"
    out = f"https://{host}{path}"
    if kept:
        out += "?" + urlencode(kept)
    return out


def url_hash(raw: str | None) -> str | None:
    """sha256 of the normalised URL (64 hex chars), or None if there is no usable URL."""
    normalized = normalize_url(raw)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest() if normalized else None


def _squash(text: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", (text or "").lower())


def content_hash(company: str | None, title: str | None, location: str | None = None) -> str:
    """Fingerprint of company + title + primary location, for spotting the same role posted on
    several boards under different URLs. Informational: it is never a uniqueness key."""
    primary_location = (location or "").split(",")[0]
    key = "|".join((_squash(company), _squash(title), _squash(primary_location)))
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def detect_source(raw: str | None, hint: str | None = None) -> str:
    """Which board a job came from: 'manual' (no URL), a known board name, or 'web'.

    `hint` (the extension's idea of the source) is only honoured when it names a board we know,
    so a hostile or noisy client can't pollute the per-source stats with arbitrary strings.
    """
    normalized = normalize_url(raw)
    if not normalized:
        return "manual"
    host = _host_of(normalized) or ""
    for domain, source in _DOMAIN_SOURCES:
        if host == domain or host.endswith("." + domain):
            return source
    labels = host.split(".")
    for label in labels[-3:-1]:
        if label in _LABEL_SOURCES:
            return _LABEL_SOURCES[label]
    cleaned = (hint or "").strip().lower()
    if cleaned in KNOWN_SOURCES and cleaned not in ("manual", "web"):
        return cleaned
    return "web"
