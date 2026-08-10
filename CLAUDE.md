# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick commands

```bash
# Full stack (Docker Compose)
cp .env.example .env       # configure secrets first
docker compose up -d       # all services (postgres, redis, minio, latex, backend, celery, frontend)

# Backend (Poetry)
cd backend
poetry install
poetry run pytest -p no:warnings                    # all tests
poetry run pytest tests/test_api.py -k test_health  # single test
poetry run alembic revision --autogenerate -m "..."  # create migration
poetry run alembic upgrade head                      # run migrations (inside container only)

# Frontend (npm)
cd frontend
npm install
npm run dev      # Vite dev server on :5173, proxies /api → backend:5454
npm run build    # tsc -b && vite build
npm run lint     # eslint
npm run format   # prettier --write .
```

**Frontend dev note**: `vite.config.ts` proxies `/api` to `http://backend:5454` (Docker) or whatever `PROXY_TARGET` is set to. For local dev outside Docker, set `PROXY_TARGET=http://localhost:5454`.

## Architecture

### Router prefixes

Every API router except health uses `/api/v1/<domain>`:

| Router | Prefix | File |
|---|---|---|
| health | `/` (no prefix) | `routers/health.py` |
| auth | `/api/v1/auth` | `routers/auth.py` |
| workspace | `/api/v1/workspace` | `routers/workspace.py` |
| jobs | `/api/v1/jobs` | `routers/jobs.py` |
| resumes | `/api/v1/resumes` | `routers/resumes.py` |
| ai | `/api/v1/ai` | `routers/ai.py` |
| billing | `/api/v1/billing` | `routers/billing.py` |
| extension | `/api/v1/extension` | `routers/extension.py` |
| webhooks | `/api/v1/webhooks` | `routers/webhooks.py` |
| files | `/api/v1/files` | `routers/files.py` |

### DB session lifecycle

`backend/app/database.py` provides `get_db()` — an async generator that yields a session, commits on success, rolls back on exception, and always closes. Every endpoint that touches the DB uses `db: AsyncSession = Depends(get_db)`. The session commits when the FastAPI dependency scope exits, not when you flush. Use `await db.flush()` to get server-generated IDs before the endpoint returns.

### Authorization flow

1. `get_current_user` (in `dependencies/auth.py`) decodes the JWT from `Authorization: Bearer <token>` and returns `{user_id, email, role, workspace_id}`.
2. Endpoints that need a workspace call `workspace_service.get_workspace_for_user(db, user_id)` — the workspace is NOT always on the JWT; it must be loaded from DB.
3. For billing-protected AI endpoints, `check_entitlement()` gates free-tier users to `trial_apps_limit` distinct jobs with tailored resume/cover letter artifacts.

### AI pipeline

All AI calls go through `call_deepseek()` in `services/ai.py`. The flow:

1. `load_prompt(name)` searches multiple paths (`backend/config/prompts/`, `./config/prompts/`, `../config/prompts/`) for `<name>.yaml`.
2. Prompt YAMLs have `system`, `user_template` (with `{{variable}}` placeholders), optional `temperature`, and optional `response_format: json_object`.
3. `render_prompt()` does simple `{{key}}` replacement — no Jinja2.
4. Calls DeepSeek API with exponential backoff: retries 3× (1.5s → 3s → 6s) on 429, 503, and connection errors.
5. Returns `{content, input_tokens, output_tokens, total_cost, model_name, ...}`.

To add a new AI tool: add the prompt YAML, then `call_deepseek("prompt_name", {...vars}, purpose="custom")`. The router logs costs via `log_ai_cost()`.

### Entitlement / billing

`check_entitlement()` in `services/ai.py`:
- Pro plan (`workspace.plan == "pro"`) → always passes.
- Active non-suspended Razorpay subscription → passes.
- Otherwise counts distinct jobs that already have `TAILORED_RESUME` or `COVER_LETTER` artifacts; limit is `workspace.trial_apps_limit` (default 2). Already-tailored jobs are free to re-generate.

### File storage

MinIO (S3-compatible) at port 9002. The `minio-init` container auto-creates the bucket on first start. Files are served through `/api/v1/files/stream/<path>` which proxies from MinIO. The `SecurityHeadersMiddleware` skips `X-Frame-Options` for `/api/v1/files/stream/` paths so PDFs can be embedded in iframes.

### LatexPreview component

`frontend/src/components/latex-preview.tsx` compiles LaTeX into a base64 blob URL client-side via a POST to the backend. It has an in-memory dedup cache keyed by LaTeX source. The job detail dialog uses a different approach — it fetches the already-compiled PDF from MinIO via XHR with Bearer token and creates a blob URL for iframe display.

### Filename convention (single source of truth)

`frontend/src/lib/filenames.ts` is the **only** place that knows how to construct and parse filenames. Format: `FirstName_LastName_Company_Role_DocumentType.pdf`. Both `pages/generate.tsx` and `components/job-detail-dialog.tsx` import from here. Never duplicate filename logic.

### Chrome extension auth

Extension tokens are SHA-256 hashed, prefixed `jfx_`, and stored in `extension_tokens` table. Users generate them in Settings. The extension sends jobs via `POST /api/v1/extension/jobs` with the token. `CORS_ORIGINS` must include `*` for `chrome-extension://` origins.

## Auth gotchas

- **Google OAuth users have `password_hash=""`** — `services/auth.py` checks this before calling bcrypt to avoid "Invalid salt" errors.
- **Refresh token race condition fixed**: `api/client.ts` uses a queue pattern — concurrent 401s wait on a single refresh promise rather than each firing their own refresh request.
- JWT structure: 15-minute access token, 7-day UUID refresh token. Workspace ID may or may not be in the JWT payload — always load from DB if you need it.
- Frontend callback: `new_user=1` query param routes to `/onboarding`, otherwise `/jobs`.

## Deployment

- CI/CD on `migration/self-hosted` branch → Oracle Cloud ARM64 self-hosted runner.
- Runner runs `docker compose down --remove-orphans && docker compose up -d --build`.
- **Never manually restart containers on the server** — the pipeline owns deployments.
- Production: `https://jobforge.helixos.pro` (frontend), `https://jobforgeapi.helixos.pro` (API), nginx reverse proxy config at `infrastructure/nginx/jobforge.conf`.

## Key patterns

- **Background emails**: Critical user-facing emails (welcome, account_deleted) use `_send_email_background()` — a daemon thread that runs SMTP synchronously, not Celery. Celery is only for the digest scheduler.
- **Prompt storage**: All AI prompts live as YAML files in `backend/config/prompts/`, not in code. Templates use `{{variable}}` syntax.
- **Cost tracking**: Every AI call logs to `ai_cost_logs` table via `log_ai_cost()`, keyed by workspace, user, job, purpose, and model.
- **Error visibility**: When the Vite proxy returns an error, it shows as HTML which is hard to debug. Check the backend container logs for the real error.
- **Celery Beat digest**: Fires at 7 AM / 6 PM IST (1:30 / 12:30 UTC). Defined in `tasks/digest.py`.
