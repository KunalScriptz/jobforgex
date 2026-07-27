# JobForge — Self-Hosted

This project is migrated from Supabase + Lovable to a fully self-hosted Docker Compose stack.

## Architecture

- **Frontend:** React 19 + Vite + React Router + TanStack Query + TailwindCSS + shadcn/ui
- **Backend:** FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2
- **Database:** PostgreSQL 16
- **Cache:** Redis 7
- **Storage:** MinIO (S3-compatible)
- **Background Jobs:** Celery + Celery Beat
- **PDF:** TeX Live LaTeX compiler
- **AI:** DeepSeek API

## Quick Start

```bash
cp .env.example .env  # Configure your keys
docker compose up -d
```

See `docs/local-development.md` for detailed instructions.
