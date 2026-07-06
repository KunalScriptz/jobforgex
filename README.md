# JobForgeX

An opinionated, AI-native job-application command center. Track every application on a Kanban board, tailor a LaTeX resume + cover letter to each JD, run a full suite of AI assistants (cover letters, interview prep, thank-you notes, negotiation drafts and more), compile real PDFs, and see per-company logos and JD keyword insights — all in one place.

> Live: <https://jobforgex.lovable.app>

---

## Features

### Job tracking
- Kanban board with five stages: **Wishlist → Applied → Interview → Offer → Rejected**
- Drag-and-drop between columns, or **multi-select** cards and **bulk-move** them across stages
- Per-company **logo** on every card (Clearbit → Google favicon → initials fallback, no API key required)
- Search and filter across company, title, JD, notes; scope by board

### Job detail dialog
Each card opens a full-height dialog with tabs:
- **Insights** — one-click JD analysis extracts keywords, hard/soft skills, seniority and a concise summary; JD is rendered with matched keywords highlighted inline
- **AI Tools** — full suite grouped by hiring stage (see below)
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
- Auto-compiles both to PDF and stores them privately in Supabase Storage
- Inline compile errors with a "Show full error" panel

### Resume Checker
- Score any resume against a JD; validates input length before spending tokens

### Cost tracking
- Every AI call logs token counts, cost, model, and purpose to a per-workspace ledger
- **Costs** page aggregates spend by day, model, and purpose

### Auth & workspace
- Email + Google OAuth (Lovable Cloud / Supabase)
- Per-user workspace with role-based access via a `has_role` security-definer function
- Row Level Security on every table

### Model / provider settings
- Bring-your-own AI provider (OpenAI-compatible) with base URL + API key
- Multiple models per workspace with a default selection and per-model pricing for cost logs
- API keys are encrypted at rest with `DEEPSEEK_KEY_ENC_SECRET`

---

## Tech stack

- **Framework**: TanStack Start v1 (React 19, Vite 7, SSR)
- **UI**: Tailwind CSS v4 + shadcn/ui + Radix + lucide-react
- **State/data**: TanStack Query
- **Editor**: `@uiw/react-codemirror`
- **DnD**: `@dnd-kit`
- **Backend**: Supabase (Postgres + Auth + Storage + RLS)
- **AI**: OpenAI-compatible chat completions (DeepSeek, OpenAI, etc.)
- **LaTeX**: external compile service pointed to by `LATEX_COMPILE_URL`
- **Package manager**: Bun

---

## Getting started (local dev)

### 1. Prerequisites
- Bun ≥ 1.1 (or Node ≥ 20)
- A Supabase project (or the Lovable Cloud one provisioned for this app)
- An OpenAI-compatible AI provider API key
- (Optional) A running LaTeX compile server (see `/latex-server`)

### 2. Install
```bash
bun install
```

### 3. Environment
Create a `.env` in the project root:
```env
# Supabase (browser + server)
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...       # server only, never expose

# App secrets
DEEPSEEK_KEY_ENC_SECRET=change-me    # symmetric key used to encrypt saved provider API keys
LATEX_COMPILE_URL=https://your-latex-server.example.com/compile
```

### 4. Run
```bash
bun run dev        # http://localhost:8080
bun run build      # production build (Cloudflare Workers preset by default)
bun run preview    # preview the built app
```

---

## Running with Docker

A `Dockerfile` is included that builds the app with the **Node server** Nitro preset and runs it on plain Node — no nginx, no reverse proxy.

```bash
# Build the image
docker build -t jobforgex .

# Run it (pass your env file)
docker run --rm -p 3000:3000 --env-file .env jobforgex
```

The container listens on `PORT=3000` (override with `-e PORT=...`). Point any TLS terminator or load balancer you already have at it.

---

## Project structure

```text
src/
  routes/
    _authenticated/        # Gated pages: jobs, generate, checker, resumes, costs, dashboard, settings
    api/                   # Server routes (raw HTTP endpoints)
    __root.tsx             # Root layout + <head> metadata
  components/              # UI, dialogs, latex-preview, company-logo, ...
  lib/                     # createServerFn modules (*.functions.ts) + server-only helpers (*.server.ts)
  config/prompts/          # YAML prompt templates (resume scorer, insight extractor, ...)
  integrations/supabase/   # Auto-generated Supabase client & types (do not edit)
  styles.css               # Tailwind v4 entry + theme tokens
supabase/migrations/       # SQL migrations (tables, RLS policies, storage buckets)
latex-server/              # Optional external LaTeX compile service
```

---

## Notes

- Never commit `.env` or `SUPABASE_SERVICE_ROLE_KEY`.
- Auto-generated files under `src/integrations/supabase/` are managed by Lovable Cloud; do not edit by hand.
- The Cloudflare preset is the default build target; the Docker image overrides this with `NITRO_PRESET=node-server` so the same code runs on any Node host.