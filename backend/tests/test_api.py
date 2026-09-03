"""Backend unit tests for JobForge."""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_health_live():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/live")
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_health_ready():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/ready")
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_root():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "JobForge API"


@pytest.mark.asyncio
async def test_auth_register_invalid():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/auth/register", json={})
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_protected_route_without_token():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/jobs/")
        assert response.status_code in [401, 403]


@pytest.mark.asyncio
async def test_ai_entitlement_without_token():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/ai/entitlement")
        assert response.status_code == 401


def test_token_response_accepts_refresh_payload():
    """refresh_access_token() returns no 'user' key — TokenResponse must accept it."""
    from app.schemas.auth import TokenResponse
    TokenResponse.model_validate(
        {"access_token": "a", "refresh_token": "b", "token_type": "bearer"}
    )


@pytest.mark.asyncio
async def test_builder_seed_without_token():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/builder/seed", json={"job_id": "00000000-0000-0000-0000-000000000000"})
        assert response.status_code in [401, 403]


def test_builder_routes_in_openapi():
    """The /api/v1/builder router must be registered."""
    spec = app.openapi()
    for path in ["/api/v1/builder/seed", "/api/v1/builder/{job_id}"]:
        assert path in spec["paths"]


def test_builder_latex_roundtrip():
    """render_latex_from_content -> latex_to_content must recover the structured content."""
    from app.services.builder import render_latex_from_content, latex_to_content

    content = {
        "contact": {"name": "John & Doe", "email": "john@doe.com", "phone": "+1 555 0100"},
        "about": "Builder engineer.",
        "work": [
            {"company": "Acme", "title": "Sr Eng", "location": "Remote",
             "start": "Jan 2021", "end": "Present",
             "bullets": ["Shipped X", "Cut cost by 20%"]}
        ],
        "skills": [{"group": "Lang", "items": ["Python", "TypeScript"]}],
        "certifications": [{"name": "SAA", "issuer": "AWS"}],
        "education": [{"school": "MIT", "degree": "BSc", "field": "CS"}],
    }
    latex = render_latex_from_content(content, "0.0,0.65,0.60", "0.0,0.0,0.55")
    assert "\\resumeSubheading" in latex

    parsed, ok = latex_to_content(latex)
    assert ok is True
    assert parsed["contact"]["name"] == "John & Doe"
    assert parsed["work"][0]["title"] == "Sr Eng"
    assert parsed["work"][0]["bullets"] == ["Shipped X", "Cut cost by 20%"]
    assert parsed["skills"][0]["items"] == ["Python", "TypeScript"]
    # LaTeX-escaped chars must round-trip back to plain text
    assert "&" in parsed["contact"]["name"]


def test_builder_apply_patch_set_and_append():
    """_apply_patch sets a scalar field or appends to a dotted-path list."""
    from app.services.builder import _apply_patch

    state = {}
    _apply_patch(state, {"path": "contact.name", "op": "set", "value": "Ada"})
    assert state["contact"]["name"] == "Ada"

    items = {"work": [{"title": "Dev"}]}
    _apply_patch(items, {"path": "work.0.bullets", "op": "append", "value": "Shipped thing"})
    assert items["work"][0]["bullets"] == ["Shipped thing"]
    _apply_patch(items, {"path": "work.0.bullets", "op": "append", "value": "Second thing"})
    assert items["work"][0]["bullets"] == ["Shipped thing", "Second thing"]
