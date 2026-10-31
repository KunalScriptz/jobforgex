# Discovery

Discovery collects fresh job postings every day and puts them in an inbox, so you triage instead of searching. It is **off by default**.

## How it works

1. You save one or more **searches** (job title or keywords, location, country, sources, how recent, remote or not).
2. Once a day, a background worker runs every search through its sources, using [JobSpy](https://github.com/speedyapply/JobSpy) for Indeed, Naukri, LinkedIn and Glassdoor. You can also press **Run now** on the Discovery page.
3. Each new posting is stored in your **inbox**. Postings you already have on your board, or have dismissed before, are skipped, and the same role seen on two boards is flagged as a possible duplicate.
4. New postings get a free keyword score immediately and an **AI fit score** against your base resume (batched, capped per run, and stopped when your monthly AI cap is reached; unscored postings keep the keyword score).
5. You **Add** a posting (it becomes a Saved card on your board, exactly like one saved from the Chrome extension) or **Dismiss** it. Dismissed postings are never suggested again. Un-triaged postings are removed after 30 days.

The scraping happens on the server in a Celery worker. Nothing is scraped in your browser.

## Turning it on

1. Set `FEATURE_DISCOVERY=true` (in `.env`, or as a repository secret if you deploy with the included workflow). This enables the Discovery page, its API, the daily schedule and the `celery-discovery` worker.
2. Optional: set `DISCOVERY_PROXIES` (comma-separated `http://user:pass@host:port`). Indeed and Naukri work without it. LinkedIn and Glassdoor often block server and datacentre IPs, so expect them to fail or return nothing without a proxy.
3. Each user opens **Discovery → Searches**, adds a search, and switches on **Run my searches every day**.

| Variable | Default | Meaning |
|---|---|---|
| `FEATURE_DISCOVERY` | `false` | Instance switch for everything above |
| `DISCOVERY_PROXIES` | empty | Proxy URLs. Contains credentials: store as a secret, never log it |
| `DISCOVERY_AI_MAX_PER_RUN` | `60` | Max postings AI-scored per workspace per run |
| `DISCOVERY_RETENTION_DAYS` | `30` | Days an un-triaged posting stays in the inbox |

## Source notes

- **Indeed, Glassdoor** need a country, otherwise JobSpy searches the USA.
- **Naukri** only covers India, so it is accepted only for an Indian location or country.
- **LinkedIn** ignores the remote-only filter.
- Every board caps results at roughly 1,000 per search, and boards change their pages without notice, so a source can break at any time. A failing source is reported on the search and never stops the others.

## Disclaimer

Scraping LinkedIn, Glassdoor and similar sites may violate their terms of service. Discovery is off by default and intended for personal, self-hosted use. It does not log in to any site. You are responsible for how you use it.

## Writing a source

A source turns a saved search into postings. Everything else (dedupe, scoring, the inbox, scheduling) is shared, so a new source is one small module.

```python
# backend/app/services/discovery_sources/greenhouse_source.py
from app.services.discovery_sources.base import RawPosting, SearchSpec, SourceError


class GreenhouseSource:
    name = "greenhouse"            # stored in searches and on postings
    label = "Greenhouse"           # shown in the UI
    requires_country = False       # True if the source needs the search's country
    india_only = False             # True to accept it only for Indian locations
    needs_proxy_hint = False       # True if it is usually blocked from server IPs

    def fetch(self, search: SearchSpec) -> list[RawPosting]:
        ...  # return plain RawPosting objects; raise SourceError("readable message") on failure
```

Then register it in `backend/app/services/discovery_sources/__init__.py` with `register(GreenhouseSource())`. It appears in the search form automatically.

Rules for a source:

- Return plain Python values only (no pandas `NaN`; use `None`).
- Give each posting the page a person would open (`url`), so it dedupes against jobs saved from the extension.
- Never put credentials in an error message. Use `redact()` from `discovery_sources` for anything that may contain a proxy URL.
- Add a test with the network call mocked (see `backend/tests/test_discovery.py`).

Good first sources: Greenhouse, Lever, Ashby (public job-board APIs), and country portals such as Bundesagentur für Arbeit or Personio.
