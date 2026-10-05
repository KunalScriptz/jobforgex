"""Tracking core against a real database (opt-in suite, see conftest.py): dedupe, status history,
lifecycle timestamps, slim lists, Overview numbers, settings, the extension, and tenant isolation of
every new route. Everything goes through the HTTP API with real JWTs."""
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

pytestmark = pytest.mark.usefixtures("migrated_db")

LATEX = r"\documentclass{article}\begin{document}hello\end{document}"


def _seed_user(session, tag: str, suffix: str) -> SimpleNamespace:
    from app.models import Board, Resume, User, Workspace
    from app.services.auth import create_access_token

    user = User(email=f"trk-{tag}-{suffix}@example.test", password_hash="x", full_name=f"User {tag}", location="Pune")
    session.add(user)
    session.flush()
    ws = Workspace(owner_user_id=user.id, name=f"ws-{tag}", timezone="UTC")
    session.add(ws)
    session.flush()
    board = Board(workspace_id=ws.id, name=f"board-{tag}")
    session.add_all([board, Resume(workspace_id=ws.id, name="Base", latex_source=LATEX, is_base=True, is_default=True)])
    session.flush()
    token = create_access_token(str(user.id), user.email, "user")
    return SimpleNamespace(
        user_id=str(user.id), ws_id=str(ws.id), board_id=str(board.id),
        headers={"Authorization": f"Bearer {token}"},
    )


@pytest.fixture
def pair(migrated_db):
    suffix = uuid.uuid4().hex[:8]
    engine = create_engine(migrated_db)
    try:
        with Session(engine) as session:
            a = _seed_user(session, "a", suffix)
            b = _seed_user(session, "b", suffix)
            session.commit()
    finally:
        engine.dispose()
    return a, b


async def add_job(client, owner, **fields):
    body = {"board_id": owner.board_id, "company": "Acme", "title": "Engineer", **fields}
    r = await client.post("/api/v1/jobs/", headers=owner.headers, json=body)
    assert r.status_code == 200, r.text
    return r.json()


async def get_job(client, owner, job_id):
    r = await client.get(f"/api/v1/jobs/{job_id}", headers=owner.headers)
    assert r.status_code == 200, r.text
    return r.json()["job"]


async def move(client, owner, job_id, status):
    r = await client.put(f"/api/v1/jobs/{job_id}", headers=owner.headers, json={"status": status})
    assert r.status_code == 200, r.text


async def events(client, owner, job_id):
    r = await client.get(f"/api/v1/jobs/{job_id}/events", headers=owner.headers)
    assert r.status_code == 200, r.text
    return list(reversed(r.json()))  # oldest first


# --------------------------------------------------------------------------- lifecycle
@pytest.mark.asyncio
async def test_a_new_job_records_its_source_and_a_created_event(client, pair):
    a, _ = pair
    job = await add_job(client, a, url="https://www.linkedin.com/jobs/view/senior-dev-at-acme-3812345678?trackingId=x")
    assert job["status"] == "wishlist" and job["source"] == "linkedin"
    assert job["applied_at"] is None and job["follow_up_at"] is None

    evs = await events(client, a, job["id"])
    assert [(e["kind"], e["to_status"], e["actor"]) for e in evs] == [("created", "wishlist", "user")]

    manual = await add_job(client, a, title="No url")
    assert manual["source"] == "manual"


@pytest.mark.asyncio
async def test_moving_a_card_stamps_dates_arms_follow_up_and_writes_history(client, pair):
    a, _ = pair
    job = await add_job(client, a)
    await move(client, a, job["id"], "applied")

    j = await get_job(client, a, job["id"])
    assert j["status"] == "applied" and j["applied_at"]
    assert j["date_applied"] == datetime.now(timezone.utc).date().isoformat()
    assert j["follow_up_at"] == (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat()
    assert j["last_reply_at"] is None

    await move(client, a, job["id"], "interview")
    j = await get_job(client, a, job["id"])
    assert j["last_reply_at"] and j["interview_at"]

    await move(client, a, job["id"], "offer")
    j = await get_job(client, a, job["id"])
    assert j["follow_up_at"] is None

    evs = await events(client, a, job["id"])
    assert [(e["from_status"], e["to_status"]) for e in evs if e["kind"] == "status_changed"] == [
        ("wishlist", "applied"), ("applied", "interview"), ("interview", "offer"),
    ]


@pytest.mark.asyncio
async def test_creating_a_job_already_applied_with_a_past_date(client, pair):
    a, _ = pair
    past = (date.today() - timedelta(days=20)).isoformat()
    job = await add_job(client, a, status="applied", date_applied=past)
    j = await get_job(client, a, job["id"])
    assert j["date_applied"] == past and j["applied_at"].startswith(past)
    # applied 20 days ago with a 7-day nudge: already overdue
    assert j["follow_up_at"] == (date.today() - timedelta(days=13)).isoformat()


@pytest.mark.asyncio
async def test_bulk_status_goes_through_the_same_state_machine(client, pair):
    a, b = pair
    j1, j2 = await add_job(client, a, title="one"), await add_job(client, a, title="two")
    foreign = await add_job(client, b, title="theirs")

    r = await client.post(
        "/api/v1/jobs/bulk-status", headers=a.headers,
        json={"ids": [j1["id"], j2["id"], foreign["id"]], "status": "applied"},
    )
    assert r.status_code == 200
    for jid in (j1["id"], j2["id"]):
        j = await get_job(client, a, jid)
        assert j["status"] == "applied" and j["applied_at"] and j["follow_up_at"]
        assert len(await events(client, a, jid)) == 2
    assert (await get_job(client, b, foreign["id"]))["status"] == "wishlist"  # not touched


@pytest.mark.asyncio
async def test_follow_up_can_be_set_and_cleared(client, pair):
    a, _ = pair
    job = await add_job(client, a)
    r = await client.put(f"/api/v1/jobs/{job['id']}/follow-up", headers=a.headers, json={"follow_up_at": "2026-12-01"})
    assert r.status_code == 200 and r.json()["follow_up_at"] == "2026-12-01"
    assert (await get_job(client, a, job["id"]))["follow_up_at"] == "2026-12-01"
    r = await client.put(f"/api/v1/jobs/{job['id']}/follow-up", headers=a.headers, json={"follow_up_at": None})
    assert r.status_code == 200
    assert (await get_job(client, a, job["id"]))["follow_up_at"] is None
    assert "follow_up_set" in [e["kind"] for e in await events(client, a, job["id"])]


@pytest.mark.asyncio
async def test_a_tailored_resume_stamps_tailored_at_once(client, pair):
    a, _ = pair
    job = await add_job(client, a)
    for _ in range(2):
        r = await client.post(
            "/api/v1/jobs/artifacts", headers=a.headers,
            json={"job_id": job["id"], "kind": "tailored_resume", "filename": "r.tex", "latex_source": LATEX},
        )
        assert r.status_code == 200
    j = await get_job(client, a, job["id"])
    assert j["tailored_at"]
    assert [e["kind"] for e in await events(client, a, job["id"])].count("tailored") == 1

    other = await add_job(client, a, title="cover letter only")
    await client.post(
        "/api/v1/jobs/artifacts", headers=a.headers,
        json={"job_id": other["id"], "kind": "cover_letter", "filename": "c.tex", "latex_source": LATEX},
    )
    assert (await get_job(client, a, other["id"]))["tailored_at"] is None


# --------------------------------------------------------------------------- duplicates
@pytest.mark.asyncio
async def test_saving_the_same_url_twice_is_a_conflict_that_names_the_original(client, pair):
    a, b = pair
    first = await add_job(client, a, url="https://boards.greenhouse.io/acme/jobs/42")
    r = await client.post(
        "/api/v1/jobs/", headers=a.headers,
        json={"board_id": a.board_id, "company": "Acme", "title": "Same", "url": "https://boards.greenhouse.io/acme/jobs/42?gh_src=zzz#apply"},
    )
    assert r.status_code == 409
    assert r.json()["detail"]["existing_job_id"] == first["id"]

    # Another workspace may save the very same posting.
    assert (await add_job(client, b, url="https://boards.greenhouse.io/acme/jobs/42"))["id"] != first["id"]


@pytest.mark.asyncio
async def test_editing_a_url_onto_another_jobs_url_is_a_conflict(client, pair):
    a, _ = pair
    one = await add_job(client, a, url="https://example.com/jobs/1", title="one")
    two = await add_job(client, a, url="https://example.com/jobs/2", title="two")

    r = await client.put(f"/api/v1/jobs/{two['id']}", headers=a.headers, json={"url": "https://example.com/jobs/1/"})
    assert r.status_code == 409 and r.json()["detail"]["existing_job_id"] == one["id"]
    assert (await get_job(client, a, two["id"]))["url"] == "https://example.com/jobs/2"

    # Re-saving a job's own URL, or changing it to a free one, is fine.
    assert (await client.put(f"/api/v1/jobs/{two['id']}", headers=a.headers, json={"url": "https://example.com/jobs/2?utm_source=x"})).status_code == 200
    assert (await client.put(f"/api/v1/jobs/{two['id']}", headers=a.headers, json={"url": "https://example.com/jobs/3"})).status_code == 200


@pytest.mark.asyncio
async def test_extension_saves_are_deduplicated_and_attributed(client, pair):
    a, _ = pair
    t = await client.post("/api/v1/extension/tokens", headers=a.headers, json={"label": "test"})
    ext = {"Authorization": f"Bearer {t.json()['token']}"}
    body = {"company": "Acme", "title": "Engineer", "url": "https://in.indeed.com/viewjob?jk=abc123&from=serp", "source": "indeed"}

    first = await client.post("/api/v1/extension/jobs", headers=ext, json=body)
    assert first.status_code == 200 and first.json()["ok"] and first.json()["duplicate"] is False
    job_id = first.json()["id"]

    again = await client.post("/api/v1/extension/jobs", headers=ext, json={**body, "url": "https://in.indeed.com/rc/clk?jk=abc123"})
    assert again.status_code == 200 and again.json()["duplicate"] is True and again.json()["id"] == job_id

    job = await get_job(client, a, job_id)
    assert job["source"] == "indeed" and job["status"] == "wishlist"
    assert [e["actor"] for e in await events(client, a, job_id)] == ["extension"]
    cards = (await client.get("/api/v1/jobs/cards?search=Engineer", headers=a.headers)).json()
    assert len([c for c in cards if c["id"] == job_id]) == 1


# --------------------------------------------------------------------------- slim list & stats
@pytest.mark.asyncio
async def test_cards_are_slim_filterable_and_counted(client, pair, migrated_db):
    a, b = pair
    li = await add_job(client, a, company="Alpha", title="Backend", url="https://www.linkedin.com/jobs/view/1111111111", location="Pune", description="needs kubernetes")
    ind = await add_job(client, a, company="Beta", title="Frontend", url="https://in.indeed.com/viewjob?jk=zz1", location="Remote", description="x" * 5000)
    await add_job(client, a, company="Gamma", title="Data", status="applied")
    await add_job(client, b, company="Alpha", title="Other tenant")

    # give one job a fit score
    engine = create_engine(migrated_db)
    with engine.begin() as conn:
        conn.execute(text("UPDATE jobs SET base_fit_score = CAST(:s AS jsonb) WHERE id = :id"), {"s": '{"score": 82}', "id": li["id"]})
    engine.dispose()

    r = await client.get("/api/v1/jobs/cards", headers=a.headers)
    assert r.status_code == 200 and r.headers["x-total-count"] == "3"
    by_id = {c["id"]: c for c in r.json()}
    assert "description" not in by_id[ind["id"]] and "notes" not in by_id[ind["id"]] and "insights" not in by_id[ind["id"]]
    assert by_id[li["id"]]["fit"] == 82 and by_id[ind["id"]]["fit"] is None
    assert by_id[li["id"]]["source"] == "linkedin"

    def ids(resp):
        return {c["id"] for c in resp.json()}

    assert ids(await client.get("/api/v1/jobs/cards?source=indeed", headers=a.headers)) == {ind["id"]}
    assert ids(await client.get("/api/v1/jobs/cards?min_fit=80", headers=a.headers)) == {li["id"]}
    assert ids(await client.get("/api/v1/jobs/cards?location=remo", headers=a.headers)) == {ind["id"]}
    assert ids(await client.get("/api/v1/jobs/cards?search=kubernetes", headers=a.headers)) == {li["id"]}  # descriptions are searchable
    assert len(ids(await client.get("/api/v1/jobs/cards?status=applied,wishlist", headers=a.headers))) == 3
    assert len(ids(await client.get("/api/v1/jobs/cards?status=applied", headers=a.headers))) == 1
    assert (await client.get("/api/v1/jobs/cards?status=bogus", headers=a.headers)).status_code == 400

    page = await client.get("/api/v1/jobs/cards?limit=2&offset=0", headers=a.headers)
    assert len(page.json()) == 2 and page.headers["x-total-count"] == "3"
    assert len((await client.get("/api/v1/jobs/cards?limit=2&offset=2", headers=a.headers)).json()) == 1


@pytest.mark.asyncio
async def test_stats_count_by_status_and_reply_rate(client, pair):
    a, _ = pair
    ids = [(await add_job(client, a, title=f"j{i}"))["id"] for i in range(5)]
    for jid in ids[:4]:
        await move(client, a, jid, "applied")
    await move(client, a, ids[0], "interview")
    await move(client, a, ids[1], "rejected")
    await move(client, a, ids[2], "offer")

    s = (await client.get("/api/v1/jobs/stats", headers=a.headers)).json()
    assert s["total"] == 5
    assert s["by_status"]["wishlist"] == 1 and s["by_status"]["applied"] == 1
    assert s["interviewing"] == 1 and s["offers"] == 1 and s["active"] == 3
    assert s["applied_30d"] == 4 and s["replied_30d"] == 3  # interview, rejection and offer replied
    assert s["reply_rate_30d"] == 0.75
    assert set(s["by_status"]) == {"wishlist", "applied", "acknowledged", "screening", "interview", "offer", "negotiating", "rejected"}


# --------------------------------------------------------------------------- overview
@pytest.mark.asyncio
async def test_overview_funnel_sources_weekly_and_attention(client, pair):
    a, _ = pair
    li = [await add_job(client, a, title=f"li{i}", url=f"https://www.linkedin.com/jobs/view/90000000{i}") for i in range(3)]
    ind = [await add_job(client, a, title=f"in{i}", url=f"https://in.indeed.com/viewjob?jk=k{i}") for i in range(2)]
    await add_job(client, a, title="saved only", url="https://careers.example.com/open/1")

    for j in li[:2] + ind:
        await move(client, a, j["id"], "applied")
    await move(client, a, ind[0]["id"], "acknowledged")
    await move(client, a, ind[1]["id"], "interview")
    await move(client, a, li[0]["id"], "offer")
    await client.post(
        "/api/v1/jobs/artifacts", headers=a.headers,
        json={"job_id": li[1]["id"], "kind": "tailored_resume", "filename": "r.tex", "latex_source": LATEX},
    )
    # one overdue follow-up
    await client.put(f"/api/v1/jobs/{li[1]['id']}/follow-up", headers=a.headers, json={"follow_up_at": "2020-01-01"})

    o = (await client.get("/api/v1/overview/summary?days=30", headers=a.headers)).json()
    assert o["window_days"] == 30
    stages = {s["key"]: s["count"] for s in o["funnel"]}
    assert stages == {"discovered": 6, "tailored": 1, "applied": 4, "replied": 3, "interviewing": 1, "offer": 1}
    assert [s["key"] for s in o["funnel"]] == ["discovered", "tailored", "applied", "replied", "interviewing", "offer"]  # no pipeline stages while the flag is off

    src = {s["source"]: s for s in o["sources"]}
    assert src["linkedin"]["applied"] == 2 and src["linkedin"]["replied"] == 1 and src["linkedin"]["reply_rate"] == 0.5
    assert src["indeed"]["applied"] == 2 and src["indeed"]["replied"] == 2 and src["indeed"]["reply_rate"] == 1.0
    assert src["indeed"]["interviews"] == 1
    assert src["web"]["applied"] == 0 and src["web"]["reply_rate"] is None
    assert o["sources"][0]["source"] in ("linkedin", "indeed")  # most applied first

    assert o["weekly"]["target"] == 10 and o["weekly"]["done"] == 4
    assert {"key": "follow_ups_due", "count": 1} in o["attention"]

    assert (await client.get("/api/v1/overview/summary?days=999", headers=a.headers)).json()["window_days"] == 30


@pytest.mark.asyncio
async def test_today_lists_what_needs_doing(client, pair):
    a, _ = pair
    due = await add_job(client, a, title="due")
    await move(client, a, due["id"], "applied")
    await client.put(f"/api/v1/jobs/{due['id']}/follow-up", headers=a.headers, json={"follow_up_at": "2020-01-01"})
    ready = await add_job(client, a, title="ready")
    await client.post("/api/v1/jobs/artifacts", headers=a.headers, json={"job_id": ready["id"], "kind": "tailored_resume", "filename": "r.tex", "latex_source": LATEX})
    fresh = await add_job(client, a, title="fresh")

    t = (await client.get("/api/v1/overview/today", headers=a.headers)).json()
    assert [c["id"] for c in t["follow_ups"]] == [due["id"]]
    assert [c["id"] for c in t["ready_to_apply"]] == [ready["id"]]
    assert [c["id"] for c in t["to_tailor"]] == [fresh["id"]]
    assert t["applied_today"] == 1 and t["weekly"]["done"] == 1
    assert "description" not in t["to_tailor"][0]


@pytest.mark.asyncio
async def test_setup_checklist_reflects_real_data(client, pair):
    a, _ = pair
    s = (await client.get("/api/v1/overview/setup", headers=a.headers)).json()
    done = {i["key"]: i["done"] for i in s["items"]}
    assert done == {"profile": True, "resume": True, "extension": False, "first_job": False, "first_application": False, "weekly_target": False}

    job = await add_job(client, a)
    await move(client, a, job["id"], "applied")
    await client.post("/api/v1/extension/tokens", headers=a.headers, json={"label": "x"})
    await client.put("/api/v1/workspace/settings", headers=a.headers, json={"weekly_target": 5})
    s = (await client.get("/api/v1/overview/setup", headers=a.headers)).json()
    assert s["done"] == s["total"] == 6


# --------------------------------------------------------------------------- settings & features
@pytest.mark.asyncio
async def test_workspace_settings_defaults_updates_and_validation(client, pair):
    a, b = pair
    r = await client.get("/api/v1/workspace/settings", headers=a.headers)
    assert r.json() == {"weekly_target": 10, "follow_up_days": 7}

    r = await client.put("/api/v1/workspace/settings", headers=a.headers, json={"weekly_target": 25})
    assert r.json() == {"weekly_target": 25, "follow_up_days": 7}  # partial update keeps the rest
    r = await client.put("/api/v1/workspace/settings", headers=a.headers, json={"follow_up_days": 3})
    assert r.json() == {"weekly_target": 25, "follow_up_days": 3}
    for bad in ({"weekly_target": 0}, {"weekly_target": 1000}, {"follow_up_days": 0}, {"follow_up_days": 365}):
        assert (await client.put("/api/v1/workspace/settings", headers=a.headers, json=bad)).status_code == 422

    # the follow-up window is honoured by later moves, and is per workspace
    job = await add_job(client, a)
    await move(client, a, job["id"], "applied")
    assert (await get_job(client, a, job["id"]))["follow_up_at"] == (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
    assert (await client.get("/api/v1/workspace/settings", headers=b.headers)).json() == {"weekly_target": 10, "follow_up_days": 7}


@pytest.mark.asyncio
async def test_features_endpoint_reports_flags(client, pair, monkeypatch):
    from app.config import settings

    a, _ = pair
    monkeypatch.setattr(settings, "FEATURE_PIPELINE", False)
    monkeypatch.setattr(settings, "FEATURE_GMAIL", False)
    assert (await client.get("/api/v1/workspace/features", headers=a.headers)).json() == {"pipeline": False, "gmail": False}
    monkeypatch.setattr(settings, "FEATURE_PIPELINE", True)
    assert (await client.get("/api/v1/workspace/features", headers=a.headers)).json()["pipeline"] is True
    # pipeline stages appear in the funnel only when the flag is on
    keys = [s["key"] for s in (await client.get("/api/v1/overview/summary", headers=a.headers)).json()["funnel"]]
    assert keys == ["discovered", "shortlisted", "tailored", "approved", "applied", "replied", "interviewing", "offer"]


# --------------------------------------------------------------------------- tenant isolation
@pytest.mark.asyncio
async def test_new_routes_require_login(client):
    for method, path, body in [
        ("GET", "/api/v1/jobs/cards", None),
        ("GET", "/api/v1/jobs/stats", None),
        ("GET", "/api/v1/jobs/events", None),
        ("GET", f"/api/v1/jobs/{uuid.uuid4()}/events", None),
        ("PUT", f"/api/v1/jobs/{uuid.uuid4()}/follow-up", {"follow_up_at": None}),
        ("GET", "/api/v1/overview/summary", None),
        ("GET", "/api/v1/overview/today", None),
        ("GET", "/api/v1/overview/setup", None),
        ("GET", "/api/v1/workspace/settings", None),
        ("PUT", "/api/v1/workspace/settings", {"weekly_target": 5}),
        ("GET", "/api/v1/workspace/features", None),
    ]:
        r = await client.request(method, path, json=body)
        assert r.status_code == 401, f"{method} {path} -> {r.status_code}"


@pytest.mark.asyncio
async def test_other_workspaces_never_see_or_change_my_tracking_data(client, pair):
    a, b = pair
    mine = await add_job(client, a, url="https://example.com/secret", title="secret role")
    await move(client, a, mine["id"], "applied")

    assert (await client.get(f"/api/v1/jobs/{mine['id']}/events", headers=b.headers)).status_code == 404
    r = await client.put(f"/api/v1/jobs/{mine['id']}/follow-up", headers=b.headers, json={"follow_up_at": "2030-01-01"})
    assert r.status_code == 404
    assert (await get_job(client, a, mine["id"]))["follow_up_at"] != "2030-01-01"

    assert mine["id"] not in {c["id"] for c in (await client.get("/api/v1/jobs/cards", headers=b.headers)).json()}
    assert (await client.get("/api/v1/jobs/cards?search=secret", headers=b.headers)).json() == []
    assert (await client.get("/api/v1/jobs/events", headers=b.headers)).json() == []
    assert (await client.get("/api/v1/jobs/stats", headers=b.headers)).json()["total"] == 0
    summary = (await client.get("/api/v1/overview/summary", headers=b.headers)).json()
    assert {s["key"]: s["count"] for s in summary["funnel"]}["applied"] == 0 and summary["sources"] == []
    today = (await client.get("/api/v1/overview/today", headers=b.headers)).json()
    assert today["follow_ups"] == [] and today["to_tailor"] == [] and today["applied_today"] == 0


# --------------------------------------------------------------------------- digest numbers
def test_digest_counts_moves_in_the_window_not_mere_edits(pair, migrated_db):
    """`applied` is 'moved to applied in the window', so editing an old applied job's notes
    (which bumps updated_at) must not make it count again."""
    from app.models import Job
    from app.tasks.digest import collect_stats

    a, _ = pair
    now = datetime.now(timezone.utc)
    engine = create_engine(migrated_db)
    try:
        with Session(engine) as session:
            def job(title, **kw):
                j = Job(workspace_id=uuid.UUID(a.ws_id), board_id=uuid.UUID(a.board_id), company="Acme", title=title, **kw)
                session.add(j)
                return j

            job("new", status="applied", applied_at=now - timedelta(hours=2))
            job("old-but-edited", status="applied", applied_at=now - timedelta(days=9), updated_at=now)
            job("replied", status="acknowledged", applied_at=now - timedelta(days=3), last_reply_at=now - timedelta(hours=1))
            job("interview", status="interview", applied_at=now - timedelta(days=5), interview_at=now - timedelta(hours=3), last_reply_at=now - timedelta(hours=3))
            job("due", status="applied", applied_at=now - timedelta(days=9), follow_up_at=now.date() - timedelta(days=1))
            job("saved", status="wishlist")
            session.commit()

            stats = collect_stats(session, uuid.UUID(a.ws_id), now - timedelta(hours=12), now.date())
    finally:
        engine.dispose()

    assert stats["applied"] == 1
    assert stats["replies"] == 2
    assert stats["interview"] == 1
    assert stats["follow_ups_due"] == 1
    assert stats["jobs_added"] == 6
