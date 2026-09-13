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

The initial schema is applied automatically via `docker-entrypoint-initdb.d/001_init.sql` when PostgreSQL starts fresh.

For incremental migrations:

```bash
cd backend

# Run Alembic migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Apply new migration
alembic upgrade head

# Rollback
alembic downgrade -1
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

### Required for billing:
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — Razorpay credentials
- `RAZORPAY_WEBHOOK_SECRET` — Razorpay webhook signing secret (Dashboard → Settings → Webhooks). Required in production: the `/api/v1/webhooks/razorpay` endpoint rejects all requests with a 503 if this is unset, rather than silently skipping signature verification.

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
