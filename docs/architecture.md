# JobForge Architecture

## Overview

JobForge is an AI-native job application command center. It tracks applications on a Kanban board, tailors LaTeX resumes and cover letters per job description using AI (DeepSeek), and provides per-company insights.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Layer                          │
│  ┌──────────────────────┐  ┌────────────────────────────┐   │
│  │  React SPA (Vite)     │  │  Chrome Extension          │   │
│  │  React Router         │  │  Manifest V3               │   │
│  │  TanStack Query       │  │  Token-based auth (jfx_)   │   │
│  │  TailwindCSS + shadcn │  │  30+ job sites supported   │   │
│  └──────────┬───────────┘  └─────────────┬──────────────┘   │
└─────────────┼───────────────────────────┼──────────────────┘
              │ HTTP REST (JSON)           │
              ▼                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (FastAPI)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Auth     │ │ Jobs     │ │ Resumes  │ │ AI Gen   │       │
│  │ Router   │ │ Router   │ │ Router   │ │ Router   │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       │             │             │             │             │
│  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐       │
│  │ Users    │ │ Extension│ │ Files    │ │ Health   │       │
│  │ Router   │ │ Router   │ │ Router   │ │ Router   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  Service Layer: auth, workspace, jobs, resumes, ai,         │
│                     storage, email                          │
│                                                             │
│  Repository Layer: SQLAlchemy 2.0 ORM                       │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │PostgreSQL │  │  Redis   │  │  MinIO   │
        │ 16        │  │  7       │  │  S3      │
        └──────────┘  └────┬─────┘  └──────────┘
                           │
                    ┌──────┴──────┐
                    │   Celery    │
                    │ Worker+Beat │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        ┌──────────┐              ┌──────────┐
        │  DeepSeek │              │ Gmail    │
        │  API      │              │ SMTP     │
        └──────────┘              └──────────┘

              ┌──────────────────────┐
              │  LaTeX Compiler      │
              │  (TeX Live Docker)   │
              └──────────────────────┘
```

## Layer Details

### Frontend (React SPA)
- **Framework**: React 19 + Vite
- **Routing**: React Router v7
- **State**: TanStack Query v5 (server state), React Context (auth)
- **Styling**: TailwindCSS v4 + shadcn/ui (Radix UI primitives)
- **TypeScript**: strict mode

### Backend (FastAPI)
- **Framework**: FastAPI 0.115+ (async)
- **ORM**: SQLAlchemy 2.0 (async) + Alembic migrations
- **Validation**: Pydantic v2
- **Auth**: JWT (access + refresh tokens), bcrypt password hashing
- **API Docs**: OpenAPI at `/docs`

### Database (PostgreSQL 16)
- 19 tables covering users, workspaces, jobs, resumes, billing
- Referential integrity with foreign keys and cascading deletes
- Indexes on all FK columns and frequently queried fields
- `updated_at` triggers via PostgreSQL functions

### Storage (MinIO)
- S3-compatible object storage
- PDF artifacts stored at `{workspace_id}/{artifact_id}.pdf`
- Presigned URLs for secure downloads (10 min expiry)

### Background Jobs (Celery)
- **Celery Worker**: Processes email sending, heavy tasks
- **Celery Beat**: Scheduled tasks (daily digests at 7 AM & 6 PM IST)
- **Broker**: Redis

### Key Design Patterns
- **Repository Pattern**: Services abstract database queries
- **Dependency Injection**: FastAPI Depends() for auth, DB sessions
- **Clean Architecture**: Routers → Services → Repositories → Models

## Security
- JWT access tokens (15 min) + refresh tokens (7 days)
- Secure headers (X-Content-Type-Options, X-Frame-Options, HSTS)
- CORS configured for frontend origin
- Input validation via Pydantic models
- Password hashing with bcrypt
- API keys stored encrypted (AES-256-GCM)
