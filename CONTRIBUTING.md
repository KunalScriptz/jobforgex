# Contributing to JobForge

Thanks for helping. A few ground rules keep the project healthy.

## Getting set up

Follow the [Quick start](README.md#quick-start), then see [`docs/local-development.md`](docs/local-development.md).

## Before you open a pull request

- **Backend:** run `cd backend && pytest -q`. For anything touching the database also run the database-backed tests against a *scratch* database (see the README).
- **Frontend:** run `cd frontend && npm run build` (it type-checks).
- Keep pull requests focused: one change, with a short description of *why*.

## Rules that are easy to break

- **Every new API route must be authenticated and scoped to the caller's workspace.** A test (`tests/test_foundations.py`) fails if a route is open. Another user's ids must return 404, never their data.
- **A job's status changes only through `services/job_state.py`.** It keeps the timestamps, follow-up date and audit trail consistent.
- **Migrations are hand-written, additive and idempotent** (`ADD COLUMN IF NOT EXISTS`, no drops, renames or type changes). Never edit an existing revision.
- **New environment variables** need an entry in `.env.example`, in the `x-backend-env` block of `docker-compose.yml`, and (if deployed through CI) in the `.env` step of `.github/workflows/ci.yml`.
- **Never commit secrets.** `.env` is gitignored. Use `.env.example` for placeholders only.

## Commit messages

Short imperative subject (`fix: ...`, `feat: ...`), with a body explaining the reason when it isn't obvious.
