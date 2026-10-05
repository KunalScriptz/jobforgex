"""Cross-tenant isolation: one user must never read or change another workspace's data.

DB-backed: needs TEST_DATABASE_URL_SYNC (see conftest.py); skipped otherwise. Everything goes
through the real HTTP routes with real JWTs, so a route that forgets its auth dependency or its
workspace filter fails here.
"""
import os
import uuid
from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

pytestmark = pytest.mark.usefixtures("migrated_db")

LATEX = r"\documentclass{article}\begin{document}hello\end{document}"


def _seed_tenant(session, tag: str, suffix: str) -> SimpleNamespace:
    from app.models import Board, Job, JobArtifact, Resume, ResumeVersion, User, Workspace
    from app.services.auth import create_access_token

    user = User(email=f"{tag}-{suffix}@example.test", password_hash="x")
    session.add(user)
    session.flush()
    ws = Workspace(owner_user_id=user.id, name=f"ws-{tag}")
    session.add(ws)
    session.flush()
    board = Board(workspace_id=ws.id, name=f"board-{tag}")
    session.add(board)
    session.flush()
    job = Job(
        workspace_id=ws.id, board_id=board.id, company="Acme", title=f"job-{tag}",
        description="desc", status="wishlist",
    )
    session.add(job)
    session.flush()
    artifact = JobArtifact(
        workspace_id=ws.id, job_id=job.id, kind="tailored_resume", filename="r.tex",
        latex_source=LATEX, pdf_storage_path=f"{ws.id}/doc.pdf",
    )
    resume = Resume(workspace_id=ws.id, name=f"resume-{tag}", latex_source="x", is_base=True, is_default=True)
    session.add_all([artifact, resume])
    session.flush()
    version = ResumeVersion(resume_id=resume.id, workspace_id=ws.id, latex_source="v1")
    session.add(version)
    session.flush()
    token = create_access_token(str(user.id), user.email, "user")
    return SimpleNamespace(
        ws_id=str(ws.id), board_id=str(board.id), job_id=str(job.id), job_title=f"job-{tag}",
        artifact_id=str(artifact.id), resume_id=str(resume.id), version_id=str(version.id),
        board_name=f"board-{tag}", headers={"Authorization": f"Bearer {token}"},
    )


@pytest.fixture
def tenants(migrated_db):
    """Two independent users, each with a workspace, board, job, artifact, resume and version."""
    suffix = uuid.uuid4().hex[:8]
    engine = create_engine(migrated_db)
    try:
        with Session(engine) as session:
            a = _seed_tenant(session, "a", suffix)
            b = _seed_tenant(session, "b", suffix)
            session.commit()
    finally:
        engine.dispose()
    return a, b


@pytest_asyncio.fixture
async def client(migrated_db, monkeypatch):
    from app.database import get_db
    from app.main import app
    from app.services import ai as ai_service
    from app.services import storage as storage_service

    # The tests never need object storage or an LLM; make any accidental call loud.
    async def fake_pdf_bytes(path):
        return b"%PDF-1.4 fake"

    async def no_llm(*args, **kwargs):
        raise AssertionError("call_deepseek must not be reached for a rejected request")

    monkeypatch.setattr(storage_service, "get_pdf_bytes", fake_pdf_bytes)
    monkeypatch.setattr(ai_service, "call_deepseek", no_llm)

    # A pool-less engine per test: the app's global pool can't be shared across pytest's loops.
    engine = create_async_engine(os.environ["DATABASE_URL"], poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


# --------------------------------------------------------------------------- helpers
async def _job(client, owner, job_id=None):
    r = await client.get(f"/api/v1/jobs/{job_id or owner.job_id}", headers=owner.headers)
    return r


# --------------------------------------------------------------------------- tests
@pytest.mark.asyncio
async def test_unauthenticated_requests_are_rejected(client, tenants):
    a, _ = tenants
    calls = [
        ("GET", f"/api/v1/jobs/{a.job_id}", None),
        ("PUT", f"/api/v1/jobs/{a.job_id}", {"title": "x"}),
        ("DELETE", f"/api/v1/jobs/{a.job_id}", None),
        ("POST", "/api/v1/jobs/bulk-status", {"ids": [a.job_id], "status": "applied"}),
        ("GET", f"/api/v1/jobs/artifacts/{a.job_id}", None),
        ("DELETE", f"/api/v1/jobs/artifacts/{a.artifact_id}", None),
        ("PATCH", f"/api/v1/jobs/artifacts/{a.artifact_id}", {"latex_source": LATEX}),
        ("GET", f"/api/v1/files/stream/{a.artifact_id}", None),
        ("GET", f"/api/v1/files/download/{a.artifact_id}", None),
        ("DELETE", f"/api/v1/files/{a.artifact_id}", None),
        ("PUT", f"/api/v1/workspace/boards/{a.board_id}", {"name": "x"}),
        ("DELETE", f"/api/v1/workspace/boards/{a.board_id}", None),
        ("GET", f"/api/v1/resumes/{a.resume_id}/versions", None),
        ("PUT", f"/api/v1/resumes/{a.resume_id}/colors?primary_color=%23000000&secondary_color=%23111111", None),
        ("POST", "/api/v1/resumes/latex-compile", {"source": LATEX}),
    ]
    for method, path, body in calls:
        r = await client.request(method, path, json=body)
        assert r.status_code == 401, f"{method} {path} -> {r.status_code}"


@pytest.mark.asyncio
async def test_owner_keeps_full_access(client, tenants):
    a, _ = tenants
    h = a.headers

    r = await client.get(f"/api/v1/jobs/{a.job_id}", headers=h)
    assert r.status_code == 200 and r.json()["job"]["id"] == a.job_id
    assert (await client.put(f"/api/v1/jobs/{a.job_id}", headers=h, json={"title": "renamed"})).status_code == 200
    assert (await client.get(f"/api/v1/jobs/{a.job_id}", headers=h)).json()["job"]["title"] == "renamed"
    assert (await client.post("/api/v1/jobs/bulk-status", headers=h, json={"ids": [a.job_id], "status": "acknowledged"})).status_code == 200
    assert (await client.get(f"/api/v1/jobs/{a.job_id}", headers=h)).json()["job"]["status"] == "acknowledged"

    arts = await client.get(f"/api/v1/jobs/artifacts/{a.job_id}", headers=h)
    assert arts.status_code == 200 and [x["id"] for x in arts.json()] == [a.artifact_id]
    assert (await client.get(f"/api/v1/files/stream/{a.artifact_id}", headers=h)).status_code == 200
    assert (await client.post("/api/v1/resumes/pdf-url", headers=h, json={"artifact_id": a.artifact_id})).status_code == 200
    assert (await client.put(f"/api/v1/workspace/boards/{a.board_id}", headers=h, json={"name": "mine"})).status_code == 200
    vers = await client.get(f"/api/v1/resumes/{a.resume_id}/versions", headers=h)
    assert vers.status_code == 200 and len(vers.json()) == 1
    assert (await client.put(f"/api/v1/resumes/{a.resume_id}/colors?primary_color=%23123456&secondary_color=%23654321", headers=h)).status_code == 200
    assert (await client.get(f"/api/v1/ai/entitlement?job_id={a.job_id}", headers=h)).status_code == 200

    created = await client.post(
        "/api/v1/jobs/", headers=h,
        json={"board_id": a.board_id, "company": "NewCo", "title": "New role"},
    )
    assert created.status_code == 200


@pytest.mark.asyncio
async def test_cross_tenant_reads_are_404(client, tenants):
    a, b = tenants
    h = b.headers

    assert (await client.get(f"/api/v1/jobs/{a.job_id}", headers=h)).status_code == 404
    assert (await client.get(f"/api/v1/jobs/artifacts/{a.job_id}", headers=h)).status_code == 404
    assert (await client.get(f"/api/v1/files/stream/{a.artifact_id}", headers=h)).status_code == 404
    assert (await client.get(f"/api/v1/files/download/{a.artifact_id}", headers=h)).status_code == 404
    assert (await client.post("/api/v1/resumes/pdf-url", headers=h, json={"artifact_id": a.artifact_id})).status_code == 404
    assert (await client.post("/api/v1/resumes/compile", headers=h, json={"artifact_id": a.artifact_id})).status_code == 404
    # Version listing is scoped by workspace, so a foreign resume simply has no visible versions.
    vers = await client.get(f"/api/v1/resumes/{a.resume_id}/versions", headers=h)
    assert vers.status_code == 200 and vers.json() == []
    # And a malformed id is a clean 404, not a 500.
    assert (await client.get("/api/v1/files/stream/not-a-uuid", headers=h)).status_code == 404

    # B's own list never contains A's job.
    mine = await client.get("/api/v1/jobs/", headers=h)
    assert a.job_id not in {j["id"] for j in mine.json()}


@pytest.mark.asyncio
async def test_cross_tenant_writes_change_nothing(client, tenants):
    a, b = tenants
    h = b.headers

    assert (await client.put(f"/api/v1/jobs/{a.job_id}", headers=h, json={"title": "pwned"})).status_code == 404
    assert (await client.delete(f"/api/v1/jobs/{a.job_id}", headers=h)).status_code == 200  # idempotent no-op
    assert (await client.post("/api/v1/jobs/bulk-status", headers=h, json={"ids": [a.job_id], "status": "rejected"})).status_code == 200
    assert (await client.patch(f"/api/v1/jobs/artifacts/{a.artifact_id}", headers=h, json={"latex_source": LATEX})).status_code == 404
    assert (await client.delete(f"/api/v1/jobs/artifacts/{a.artifact_id}", headers=h)).status_code == 200
    assert (await client.delete(f"/api/v1/files/{a.artifact_id}", headers=h)).status_code == 200
    assert (await client.put(f"/api/v1/workspace/boards/{a.board_id}", headers=h, json={"name": "pwned"})).status_code == 404
    assert (await client.delete(f"/api/v1/workspace/boards/{a.board_id}", headers=h)).status_code == 404
    assert (await client.put(f"/api/v1/resumes/{a.resume_id}/colors?primary_color=%23ff0000&secondary_color=%2300ff00", headers=h)).status_code == 404
    # Can't plant data in A's workspace by naming A's ids.
    assert (await client.post("/api/v1/jobs/", headers=h, json={"board_id": a.board_id, "company": "X", "title": "Y"})).status_code == 404
    assert (await client.post("/api/v1/jobs/artifacts", headers=h, json={"job_id": a.job_id, "kind": "tailored_resume", "filename": "x.tex", "latex_source": LATEX})).status_code == 404

    # ...and A's data is exactly as it was.
    got = (await _job(client, a)).json()["job"]
    assert got["title"] == a.job_title and got["status"] == "wishlist"
    arts = (await client.get(f"/api/v1/jobs/artifacts/{a.job_id}", headers=a.headers)).json()
    assert [x["id"] for x in arts] == [a.artifact_id]
    boards = (await client.get("/api/v1/workspace/boards", headers=a.headers)).json()
    assert [x["name"] for x in boards] == [a.board_name]


@pytest.mark.asyncio
async def test_job_cannot_be_moved_to_a_foreign_board(client, tenants):
    a, b = tenants
    r = await client.put(f"/api/v1/jobs/{a.job_id}", headers=a.headers, json={"board_id": b.board_id})
    assert r.status_code == 404
    assert (await _job(client, a)).json()["job"]["board_id"] == a.board_id


@pytest.mark.asyncio
async def test_ai_endpoints_reject_foreign_and_malformed_job_ids(client, tenants):
    a, b = tenants
    h = b.headers
    for job_id in (a.job_id, "not-a-uuid", str(uuid.uuid4())):
        gen = await client.post(
            "/api/v1/ai/generate", headers=h,
            json={"prompt_name": "extract_insights", "vars": {"jd": "x"}, "job_id": job_id, "purpose": "jd_parsing"},
        )
        assert gen.status_code == 404, f"/ai/generate with job_id={job_id}"
        edit = await client.post(
            "/api/v1/ai/edit-resume", headers=h,
            json={"latex_source": LATEX, "question": "q", "job_id": job_id},
        )
        assert edit.status_code == 404, f"/ai/edit-resume with job_id={job_id}"
        ats = await client.post("/api/v1/ai/ats-score", headers=h, json={"job_id": job_id, "latex_source": LATEX})
        assert ats.status_code == 404, f"/ai/ats-score with job_id={job_id}"
        ent = await client.get(f"/api/v1/ai/entitlement?job_id={job_id}", headers=h)
        assert ent.status_code == 404, f"/ai/entitlement with job_id={job_id}"

    # A's job was not touched by any of that.
    assert (await _job(client, a)).json()["job"]["insights"] is None
