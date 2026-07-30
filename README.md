# JobForgeX

An opinionated, AI-native job-application command center. Track every application on a Kanban board, tailor a LaTeX resume + cover letter to each JD, run a full suite of AI assistants (cover letters, interview prep, thank-you notes, negotiation drafts and more), compile real PDFs, and see per-company logos and JD keyword insights — all in one place.

## Features

### Job tracking
- Kanban board with five stages: **Wishlist → Applied → Interview → Offer → Rejected**
- Drag-and-drop between columns, or **multi-select** cards and **bulk-move** them across stages
- Per-company **logo** on every card (Clearbit → Google favicon → initials fallback, no API key required)
- Search and filter across company, title, JD, notes; scope by board

### Job detail dialog
Each card opens a full-height dialog with tabs:
- **Insights** — one-click JD analysis extracts keywords, hard/soft skills, seniority and a concise summary; JD is rendered with matched keywords highlighted inline
- **AI Tools** — full suite grouped by hiring stage
- **Notes** — private notes per application
- **Documents** — every generated artifact (resume, cover letter, AI drafts) with real PDF compile status, download, and recompile
- **Company** — company name, JD link, meta

### AI Tools suite
Each tool lets you add optional context, generate, **edit the output inline**, copy, or **save as a document** attached to the job:
- **Application** — Cover Letter, Follow Up After Application
- **Interview** — Interview Prep Questions, Questions to Ask, Thank You, Follow Up After Interview, Reschedule, Decline Interview
- **Offer** — Negotiation, Acceptance, Decline, Time Extension

### Resume authoring
- Full **LaTeX base resume** editor with CodeMirror, **dark-mode aware** theming
- Live **real PDF preview** compiled server-side, debounced auto-recompile, error surface with full log
- Per-resume **primary / accent color** pickers that patch `\definecolor` in-place
- **Version history** with restore

### Generate (tailored per JD)
- Paste a JD, generate a **tailored resume** + **cover letter** in one pass
- Auto-compiles both to PDF and stores them in MinIO

### Auth & workspace
- Email + Google OAuth (custom JWT)
- Per-user workspace

### Cost tracking
- Every AI call logs token counts, cost, model, and purpose to a per-workspace ledger

---

## Tech stack

- **Frontend**: React 19 + Vite + React Router + TanStack Query + TailwindCSS + shadcn/ui
- **Backend**: FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2
- **Database**: PostgreSQL 17
- **Cache**: Redis 8
- **Storage**: MinIO (S3-compatible)
- **Background Jobs**: Celery + Celery Beat
- **PDF**: TeX Live LaTeX compiler
- **AI**: DeepSeek API

---

## Quick Start

```bash
cp .env.example .env  # Configure your keys
docker compose up -d
```

---

## Project structure

```text
backend/
  app/
    routers/          # FastAPI route handlers
    models/           # SQLAlchemy ORM models
    schemas/          # Pydantic request/response schemas
    services/         # Business logic
    middleware/       # CORS, security headers, logging
  config/
    prompts/          # YAML prompt templates (22 total)
    models/           # AI model configurations
  alembic/            # Database migrations
  tests/              # Pytest test suite

frontend/
  src/
    pages/            # React page components
    components/       # UI components + shadcn/ui
    api/              # Axios client + API hooks
    context/          # Auth context
    hooks/            # Custom hooks
    lib/              # Utilities
  public/             # Static assets

latex-server/         # Self-hosted TeX Live PDF compiler (Express + pdflatex)
extension/            # Chrome extension source
database/             # Initial SQL schema
infrastructure/       # Deployment configs (nginx, servers)
```
