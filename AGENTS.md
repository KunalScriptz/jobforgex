# AGENTS.md — JobForge

Self-hosted job search command center. Docker Compose monolith with React frontend + FastAPI backend.

## Stack

| Layer | Stack |
|---|---|
| Frontend | React 19 + Vite + React Router 7 + TanStack Query + TailwindCSS + shadcn/ui |
| Backend | FastAPI + SQLAlchemy 2.0 (async) + Pydantic v2 + python-jose |
| DB | PostgreSQL 17 (port 5433), Redis 8 (6380), MinIO (9002/9003) |
| Jobs | Celery + Celery Beat (Redis broker), LaTeX via latex-server (5959) |
| AI | DeepSeek API (httpx, retries 3× on 503/429) |
| Auth | Google OAuth 2.0 only (no email/password signup in frontend) |
| Email | Gmail SMTP (port 465), sent via background daemon thread (not Celery-dependent) |
| Payments | Razorpay subscriptions + webhooks |

## Services & Ports

`postgres:5433` `redis:6380` `minio:9002` `latex-server:5959` `backend:5454` `frontend:5173` `pgadmin:5051`

## Production

- Web: `https://jobforge.helixos.pro`, API: `https://jobforgeapi.helixos.pro`
- Nginx routes both via `infrastructure/nginx/jobforge.conf`
- `.env` on server overrides defaults — not committed

## CI/CD

- GitHub Actions on `migration/self-hosted` branch → Oracle Cloud self-hosted runner
- Runner runs `docker compose up -d --build` automatically
- **Never manually restart containers** — the pipeline owns deployments

## Key Files

`backend/app/`
- `config.py` — Pydantic `BaseSettings`, loads `.env` via `dotenv`
- `middleware/cors.py` — `WildcardCORSMiddleware`: `*` becomes regex `.*` for CORS
- `middleware/setup.py` — `X-Frame-Options: DENY` (skipped for `/api/v1/files/stream/` paths)
- `services/auth.py` — bcrypt, Google OAuth, JWT (15min access + 7-day UUID refresh)
- `services/ai.py` — `call_deepseek()` retries 3× (1.5s→3s→6s), prompts from `config/prompts/*.yaml`
- `services/email.py` — HTML templates in-file: `welcome`, `account_deleted`, `password_reset`, `digest`
- `tasks/digest.py` — Celery Beat at 7 AM / 6 PM IST (1:30 / 12:30 UTC)
- `config/prompts/pdf_to_latex.yaml` — full JobForge LaTeX template skeleton for PDF import

`frontend/src/`
- `lib/filenames.ts` — **single source of truth** for `extractResumeName()` and `tailoredDocFilename()`. Both `generate.tsx` and `job-detail-dialog.tsx` import from here. No duplicates.
- `components/page-title.tsx` — sets `document.title = "JobForge | Section"` per route
- `context/auth-context.tsx` — JWT in localStorage, auto-refresh via Axios interceptor

## Auth Gotchas

- Google OAuth users have `password_hash=""` — login checks this before bcrypt to avoid "Invalid salt"
- Frontend callback: `new_user=1` param routes to `/onboarding`, otherwise `/jobs`
- Backend `/register` and `/login` kept for API compat but frontend only shows Google sign-in

## Onboarding

- Step 1: workspace name → `onboarding_step=2`
- Step 2: upload base LaTeX resume (paste textarea OR import PDF)
- On finish: POST `/api/v1/workspace/onboarding?step=4&complete=true` returns `{ok, step, complete}`
- Resumes page: if no base resume, shows "Complete your setup" button → `/onboarding`

## Filename Convention

`FirstName_LastName_Company_Role_DocumentType.pdf`
- `lib/filenames.ts` handles all naming — extract from `\textbf{\Huge ...}`, `\name{}`, `\resumeName{}` patterns

## PDF Preview

- `LatexPreview` component: compiles LaTeX → base64 blob URL (in-memory cache)
- Job detail dialog: fetches PDF via XHR with Bearer token, creates blob URL for iframe

## Chrome Extension

- Manifest V3 in `extension/`
- Saves jobs via `POST /api/v1/extension/jobs` with `jfx_` prefixed token
- Tokens SHA-256 hashed, generated in Settings
- `CORS_ORIGINS` must include `*` for `chrome-extension://` origin to pass preflight
- Fallback host: `https://jobforgeapi.helixos.pro`

## Billing

- Free trial: 2 apps (distinct jobs with tailored resume/cover letter)
- `FALLBACK_PLANS` in `billing.tsx` keyed by country — works with empty DB pricing table
- `GET /api/v1/billing/pricing` joins `plans` + `geo_pricing`, falls back to plan defaults

## Email Sending Pattern

```python
# For critical user-facing emails (welcome, account_deleted) — use background thread:
_send_email_background(user_email, "welcome", frontend_url=url)
# Located in routers/auth.py — runs SMTP in daemon thread, no Celery needed
```
