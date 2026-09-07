import html
import re
from urllib.parse import quote

import httpx

JOB_BOARD_HOSTS = {
    "linkedin.com",
    "indeed.com",
    "glassdoor.com",
    "greenhouse.io",
    "lever.co",
    "workable.com",
    "seek.com.au",
    "seek.co.nz",
    "jobstreet.com",
    "jobsdb.com",
    "naukri.com",
    "monster.com",
    "ziprecruiter.com",
    "simplyhired.com",
    "wellfound.com",
    "hired.com",
    "dice.com",
    "careerbuilder.com",
    "angel.co",
}

_META_NAME_DESC = re.compile(
    r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', re.I | re.S
)
_META_NAME_DESC_REV = re.compile(
    r'<meta[^>]+content=["\'](.*?)["\'][^>]+name=["\']description["\']', re.I | re.S
)
_META_OG_DESC = re.compile(
    r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\'](.*?)["\']', re.I | re.S
)
_META_OG_DESC_REV = re.compile(
    r'<meta[^>]+content=["\'](.*?)["\'][^>]+property=["\']og:description["\']', re.I | re.S
)
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_LEGAL_SUFFIX = re.compile(
    r"\b(inc|llc|ltd|corp|corporation|co|company|gmbh|plc|the)\b\.?", re.I
)


def _clean_company(company: str) -> str:
    return _LEGAL_SUFFIX.sub("", company).strip()


def _hostname_from_url(url: str | None) -> str | None:
    if not url:
        return None
    try:
        normalised = url if url.startswith("http") else f"https://{url}"
        hostname = httpx.URL(normalised).host
        if not hostname:
            return None
        hostname = hostname.lower().removeprefix("www.")
        if hostname in JOB_BOARD_HOSTS:
            return None
        for board in JOB_BOARD_HOSTS:
            if hostname.endswith("." + board):
                return None
        return hostname
    except Exception:
        return None


def _guess_domain(company: str) -> str:
    cleaned = re.sub(
        r"\b(inc|llc|ltd|corp|corporation|co|company|gmbh|plc|technologies|solutions|services|group)\b\.?",
        "",
        company,
        flags=re.I,
    )
    return re.sub(r"[^a-z0-9]", "", cleaned.lower()) + ".com"


def resolve_domain(*, company: str, domain: str | None = None, url: str | None = None) -> str:
    return domain or _hostname_from_url(url) or _guess_domain(company)


def _domain_base(domain: str) -> str:
    host = (domain or "").lower().removeprefix("www.").split("/")[0]
    return host.split(".")[0]


def _is_internal(domain: str) -> bool:
    host = (domain or "").lower().rstrip(".")
    if not host:
        return True
    if host in {"localhost"} or host.endswith(".local") or host.endswith(".internal"):
        return True
    if re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", host):
        parts = host.split(".")
        if parts[0] == "127" or parts[0] == "10":
            return True
        if parts[0] == "192" and parts[1] == "168":
            return True
        if parts[0] == "172" and 16 <= int(parts[1]) <= 31:
            return True
    return False


def _clean_text(raw: str, limit: int = 400) -> str:
    if not raw:
        return ""
    text = html.unescape(raw)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def _extract_description(body: str) -> str:
    for pattern in (_META_NAME_DESC, _META_NAME_DESC_REV, _META_OG_DESC, _META_OG_DESC_REV):
        m = pattern.search(body)
        if m:
            text = _clean_text(m.group(1))
            if text:
                return text
    m = _TITLE.search(body)
    if m:
        text = _clean_text(m.group(1))
        if text:
            return text
    return ""


async def fetch_website_description(domain: str) -> str | None:
    if _is_internal(domain):
        return None
    headers = {"User-Agent": "Mozilla/5.0 (JobForge company lookup)"}
    for scheme in ("https", "http"):
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
                res = await client.get(f"{scheme}://{domain}", headers=headers)
                if res.status_code >= 400:
                    continue
                body = res.text[:1_000_000]
                desc = _extract_description(body)
                if desc:
                    return desc
        except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError, httpx.TooManyRedirects):
            continue
        except Exception:
            continue
    return None


async def _wiki_summary(client: httpx.AsyncClient, title: str) -> dict | None:
    try:
        res = await client.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(title)}?redirect=true"
        )
    except Exception:
        return None
    if res.status_code != 200:
        return None
    try:
        j = res.json()
    except Exception:
        return None
    if j.get("type") == "disambiguation":
        return None
    extract = j.get("extract") or j.get("description")
    if not extract:
        return None
    return {"description": _clean_text(extract, 600), "url": j.get("content_urls", {}).get("desktop", {}).get("page")}


async def wikipedia_lookup(company: str, domain: str) -> dict | None:
    cleaned = _clean_company(company)
    candidates = list(dict.fromkeys(c for c in (company, cleaned) if c))
    base = _domain_base(domain)
    async with httpx.AsyncClient(timeout=10) as client:
        for c in candidates:
            j = await _wiki_summary(client, c)
            if j:
                return j

        search_params = {
            "action": "query",
            "list": "search",
            "format": "json",
            "srlimit": "5",
            "srsearch": cleaned or company,
        }
        try:
            res = await client.get("https://en.wikipedia.org/w/api.php", params=search_params)
            if res.status_code != 200:
                return None
            hits = (res.json().get("query") or {}).get("search") or []
        except Exception:
            return None

        # Domain-scoped preference: titles containing the domain base word,
        # preferring those with an organisation signal.
        org_signal = re.compile(r"company|corporation|inc|ltd|group|technologies|software|systems", re.I)
        def _score(hit: dict) -> tuple[int, int]:
            title = hit.get("title", "")
            has_base = int(bool(base) and base.lower() in title.lower())
            has_org = int(bool(org_signal.search(title)))
            return (has_base, has_org)

        ordered = sorted(hits, key=_score, reverse=True)
        for hit in ordered:
            j = await _wiki_summary(client, hit.get("title", ""))
            if j:
                return j
    return None
