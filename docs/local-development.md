# Local Development Guide

## Prerequisites

- Docker 24+ and Docker Compose v2
- Node.js 20+ (for local frontend development without Docker)
- Python 3.12+ (for local backend development without Docker)
- Bun or npm

## Option 1: Full Docker (Recommended)

```bash
cp .env.example .env
# Edit .env with your API keys
docker compose up -d
```

All services start automatically. Hot reload is enabled for both frontend and backend.

## Option 2: Backend Only in Docker

```bash
# Start infrastructure services
docker compose up -d postgres redis minio latex-server

# Start backend locally
cd backend
pip install -r requirements.txt  # if you have one
# Or using the Dockerfile:
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Option 3: Full Local

```bash
# 1. Start PostgreSQL, Redis, MinIO (or use local installs)
docker compose up -d postgres redis minio

# 2. Backend
cd backend
python -m venv venv
source venv/bin/activate
# Install dependencies from Dockerfile or pyproject.toml
uvicorn app.main:app --reload --port 8000

# 3. Frontend
cd frontend
npm install
npm run dev

# 4. LaTeX Server (if needed locally)
cd latex-server
npm install
node server.js
```

## Database Migrations

The schema is owned by **Alembic** (`backend/alembic/`). There are no PostgreSQL initdb scripts.

- `docker compose up` applies migrations automatically: the `backend` container runs
  `alembic upgrade head` on start, and the worker/beat containers wait for it.
- `0001_baseline` builds the schema on an empty database (replaying the legacy SQL in
  `backend/alembic/baseline_sql/`) and only applies idempotent `ADD COLUMN IF NOT EXISTS`
  statements to an existing one, so it is safe on both.
- Revisions are hand-written and expand-only (no drops, renames or type narrowing), with
  idempotent DDL. See `backend/alembic/script.py.mako`.

```bash
cd backend

# Apply migrations by hand (e.g. against a database outside docker compose)
alembic upgrade head

# Create a new revision (write the DDL yourself; don't rely on --autogenerate)
alembic revision -m "description"

# Roll back the latest revision
alembic downgrade -1
```

### Running the DB-backed tests

Most tests need no database. The cross-tenant isolation tests are opt-in; point them at a
**scratch** database (they insert rows) and they migrate it to head themselves:

```bash
cd backend
TEST_DATABASE_URL_SYNC=postgresql+psycopg2://jobforgex:jobforgex@localhost:5433/jobforgex_test \
  .venv/bin/python -m pytest -q
```

## API Documentation

- OpenAPI (Swagger): http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Raw spec: http://localhost:8000/openapi.json

## Environment Variables

All environment variables are documented in `../.env.example`.

### Required for basic operation:
- `JWT_SECRET` — any long random string
- `DB_PASSWORD` — PostgreSQL password
- `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` — MinIO credentials (defaults work)

### Required for AI features:
- `DEEPSEEK_API_KEY` — DeepSeek API key
- `DEEPSEEK_KEY_ENC_SECRET` — encryption key for stored API keys

### Required for email:
- `SMTP_USER`, `SMTP_PASS` — Gmail app credentials

### Required for PDF compilation:
- `LATEX_COMPILE_URL` — URL to LaTeX server (default works in Docker)

## Useful Commands

```bash
# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Restart a service
docker compose restart backend

# Reset database (warning: deletes all data)
docker compose down -v
docker compose up -d

# Connect to PostgreSQL directly
docker compose exec postgres psql -U jobforgex jobforgex

# Access Redis
docker compose exec redis redis-cli

# Check Celery tasks
docker compose logs celery-worker

# Run backend shell
docker compose exec backend python
```
