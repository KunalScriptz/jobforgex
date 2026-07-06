
# JobForge — Full Build Plan

A workspace-scoped job-search command center with DeepSeek-powered resume tailoring, cover letter generation, resume scoring, cost tracking, and daily email reports. Backend on Lovable Cloud (Postgres + Auth + Storage + server functions).

## 1. Stack & foundation

- TanStack Start (existing template), TanStack Query, shadcn/ui, Tailwind v4.
- Lovable Cloud for Postgres, Auth (email/password), Storage (PDF artifacts), and server functions (holding DeepSeek API keys and prompt YAMLs).
- LaTeX → PDF: **SwiftLaTeX (XeTeX WASM)** loaded client-side only from `public/wasm/`. Real Overleaf-style compile, no external service. First load ~15MB (cached). Falls back to `.tex` download if browser can't run WASM.
- Charts: `recharts`. Color picker: `react-colorful`. Code editor: `@uiw/react-codemirror` with LaTeX mode.
- YAML prompts: `js-yaml`, loaded from `src/config/prompts/*.yaml` (bundled as `?raw` imports) so non-devs can edit them in the repo.

## 2. Data model (Postgres, RLS on every table)

```text
workspaces(id, owner_user_id, name, timezone, monthly_budget_usd, created_at)
workspace_members(workspace_id, user_id, role)         -- for future multi-user; owner auto-inserted
user_roles(user_id, role)                              -- app_role enum: user, admin

ai_providers(id, workspace_id, name, base_url, api_key_encrypted, is_active)
ai_models(id, workspace_id, provider_id, name, display_name,
          input_price_per_1m numeric, output_price_per_1m numeric, is_default bool)

resumes(id, workspace_id, name, latex_source text, page_count int,
        primary_color text, secondary_color text, is_base bool, created_at)
resume_versions(id, resume_id, latex_source, note, created_at)

boards(id, workspace_id, name, created_at)
jobs(id, workspace_id, board_id, company, title, description, url, notes,
     status enum('wishlist','applied','interview','rejected','offer'),
     date_applied date, resume_score int, created_at)
job_artifacts(id, job_id, kind enum('tailored_resume','cover_letter'),
              filename, latex_source text, pdf_storage_path text, created_at)

ai_cost_logs(id, workspace_id, user_id, model_id, model_name,
             input_tokens int, output_tokens int, total_tokens int,
             input_cost numeric, output_cost numeric, total_cost numeric,
             purpose enum('resume_tailoring','cover_letter','resume_scoring',
                         'jd_parsing','ats_check','custom'),
             job_id nullable, created_at)

daily_email_prefs(workspace_id, enabled, send_hour_local)
```

Grants for every public table + RLS: `authenticated` scoped by `workspace_id IN (select workspace_id from workspace_members where user_id = auth.uid())`. `service_role` full access. `has_role(_user_id, _role)` security-definer function per the user-roles rule.

API keys encrypted at rest via pgcrypto (`pgp_sym_encrypt` with a `DEEPSEEK_KEY_ENC_SECRET` stored as a Lovable Cloud secret). Decrypted only inside server functions, never returned to the client.

## 3. Onboarding (3 steps, gated route `/onboarding`)

Redirect to `/onboarding` from `_authenticated` layout if the user has no workspace or hasn't completed all 3 steps (tracked by `workspaces.onboarding_step`).

1. **Workspace**: full name, email, password (Supabase auth), workspace name. Creates workspace + membership + default board "2026 Job Search".
2. **AI config**: provider dropdown (default "OpenAI Compatible"), base URL (default `https://api.deepseek.com/v1`), API key, default model. Seeds 3 DeepSeek models with prices from `config/models/deepseek_models.yaml`. Users can add/edit/delete models here or later in Settings. "Test connection" button calls a server function that makes a real `chat.completions` ping (`hello` prompt, 5 tokens) — must succeed before Next.
3. **Resume upload**: textarea for LaTeX paste, server-side page-count detection (heuristic: count `\newpage` + `\pagebreak` + a WASM compile probe if available, else 1). Stored as `is_base=true`. Color picker to override `darkturquoise`/`darkblue` (optional).

## 4. Main app routes

```text
/                            -> marketing landing (public)
/auth                        -> login/signup
/onboarding                  -> 3-step wizard
/_authenticated/dashboard    -> current board's Kanban (Wishlist/Applied/Interview/Rejected/Offer)
/_authenticated/jobs         -> table view w/ filter, search, bulk actions
/_authenticated/jobs/$id     -> job detail: JD, generated artifacts, cost, status timeline
/_authenticated/generate     -> paste JD, run pre-score, generate resume/cover letter
/_authenticated/resumes      -> list of resumes + versions, base resume editor
/_authenticated/resumes/$id  -> split-pane LaTeX editor + live PDF preview
/_authenticated/checker      -> resume checker (score, ATS, grammar, keyword gaps)
/_authenticated/costs        -> cost analytics dashboard
/_authenticated/settings     -> workspace, boards, AI models, budget, email prefs
```

Top bar has workspace switcher and board switcher.

## 5. AI workflow (Generate page)

1. User pastes JD (+ optional URL) and picks board + model.
2. Server function `scoreResume({jdText, resumeId, modelId})`:
   - Loads prompt from `resume_scorer.yaml`.
   - Calls DeepSeek `chat.completions` with `response_format: json_object`.
   - Returns `{score, strengths[], gaps[], missingKeywords[], missingMetrics[]}`.
   - Logs cost row with `purpose='resume_scoring'`.
3. UI shows score + breakdown + two checkboxes (Tailored Resume ✓, Cover Letter ✗) + model select.
4. On "Generate":
   - `tailorResume` (if checked): prompt from `tailor_resume.yaml`, receives base LaTeX + JD + page-count constraint + color settings. Returns LaTeX. Filename: `{Company}_{Title}_Tailored_Resume.tex` (sanitized: `[^A-Za-z0-9]+` → `_`, trimmed).
   - `generateCoverLetter` (if checked): prompt from `generate_cover_letter.yaml`. Filename `{Company}_{Title}_Cover_Letter.tex`.
   - Both log cost with the right `purpose`.
5. Job upserted into board with `status='wishlist'`, artifacts saved to `job_artifacts`, LaTeX also compiled client-side and PDF stored in Cloud Storage.

## 6. Job tracking

- Kanban board: 5 columns, drag-and-drop (`@dnd-kit`) updates `status`.
- "Add Job Manually" dialog with the required + optional fields listed in the spec.
- Filters (company / title / status / board / date_applied range) and global search backed by a `tsvector` GIN index on `company || title || description || notes`.
- Bulk select → change status.
- Job detail page shows JD, generated artifacts (view LaTeX, download `.tex` and `.pdf`), status history, per-job total AI cost.

## 7. Resume editor & checker

- Split pane: CodeMirror LaTeX source (left) + PDF canvas (right, rendered from SwiftLaTeX output via `pdf.js`).
- WYSIWYG side panel for the structured sections (Summary, Skills groups, Experience entries, Projects, Education, Achievements, Certs). Parser walks the known Jake-Gutierrez-style commands (`\resumeSubheading`, `\resumeItem`, `\section`, custom commands defined in the template) and offers form editing; serializer writes back into the LaTeX. Freeform LaTeX outside recognized sections is preserved verbatim.
- Color pickers rewrite `\definecolor{darkturquoise}{...}` and `\definecolor{darkblue}{...}` in place — instant re-render.
- Auto-save every 2s (debounced) creates a new `resume_versions` row when content diverges >5% from the last version; manual "Save version" always creates one. Version list with diff + "Restore".
- Multi-page: PDF preview supports pagination and page navigation.
- **Checker page**: same scoring server fn but with extra prompts for ATS (`ats_checker.yaml`) and grammar/spellcheck. Each check logs cost.

## 8. Cost tracking & analytics (`/costs`)

- Every DeepSeek call goes through a single `callDeepseek({workspaceId, modelId, purpose, jobId?, messages, response_format?})` helper that:
  1. Decrypts API key inside the server function.
  2. Calls the configured base URL + model.
  3. Reads `usage.prompt_tokens` / `usage.completion_tokens` from the response.
  4. Computes cost from the model's `input_price_per_1m` / `output_price_per_1m`.
  5. Inserts an `ai_cost_logs` row.
  6. Returns `{content, cost, tokens}` to the caller.
- Dashboard: total-cost KPIs, line chart over time (day/week/month toggle), pie by purpose, bar by model, per-job cost table, CSV export, monthly-budget setting + progress bar + warning banner at 80% / block at 100% (soft — user can override).

## 9. YAML prompt & model config

```
src/config/
  prompts/
    tailor_resume.yaml
    generate_cover_letter.yaml
    resume_scorer.yaml
    parse_jd.yaml
    ats_checker.yaml
  models/
    deepseek_models.yaml
```

Loaded via Vite `?raw` import + `js-yaml.load` inside server functions. YAML shape:

```yaml
system: |
  You are ...
user_template: |
  Job Description:
  {{jd}}
  Base Resume LaTeX (preserve {{page_count}} page(s)):
  {{resume_latex}}
temperature: 0.4
response_format: json_object   # optional
```

Simple `{{var}}` interpolation. Editing a YAML file changes AI behavior on the next request — no code deploy needed beyond publish.

## 10. Daily email reports

- `daily_email_prefs` per workspace with hour + timezone.
- pg_cron job hits `/api/public/cron/daily-digest` hourly with a signed `CRON_SECRET` header.
- Handler finds workspaces whose local hour matches, aggregates stats (status counts, response rate, resume-score avg, stale wishlist jobs, upcoming interviews, today/week/month AI cost, budget status), renders a React Email template with charts (SVG bar/pie generated server-side via a lightweight helper), and sends via Lovable Emails (`@lovable.dev/email-js` queue). Requires user to set up an email domain — I'll prompt with `<presentation-open-email-setup>` when they enable digests.

## 11. Security, UX, extras

- API keys encrypted with pgcrypto, decrypt only server-side, never in logs or client.
- All `createServerFn` handlers use `requireSupabaseAuth` + workspace membership check.
- Zod validation on every input; length caps on JD (100k chars), resume (200k).
- Toasts (`sonner`), skeleton loaders, error boundaries per route.
- Keyboard shortcuts (Ctrl+S save resume, Ctrl+Shift+G generate) via a small `useHotkeys` hook.
- Responsive: Kanban collapses to a single-column swipeable list on mobile; editor stacks vertically.
- Rate limit: max 20 DeepSeek calls / min / workspace via a `rate_limits` table check inside `callDeepseek`.
- Cost-alert email when daily cost > user-set threshold (reuses the digest infra).

## 12. Build order

1. Enable Lovable Cloud, migrations, RLS, grants, seed model YAML.
2. Auth + onboarding wizard + workspace/board bootstrap.
3. AI provider config + `callDeepseek` helper + test-connection.
4. Base resume upload + SwiftLaTeX WASM loader in `public/wasm/`.
5. Boards + jobs CRUD + Kanban + filters/search/bulk.
6. Generate page: score → tailor → cover letter → save artifacts.
7. Resume editor (LaTeX + PDF preview + WYSIWYG + colors + versions).
8. Checker page (ATS, grammar, keyword).
9. Cost analytics dashboard + budget + CSV export.
10. Daily email digest (requires email domain setup at that step).
11. Analytics dashboard (funnel, keywords, response time).
12. Polish: keyboard shortcuts, mobile, error/empty states, SEO on public routes.

## Technical notes / risks

- **SwiftLaTeX WASM** is the only realistic "Overleaf-like" in-browser path without an external service. It's ~15MB (cached after first load) and compiles most Jake-Gutierrez-style resumes in 1–3s. If a specific package in the template isn't bundled, we fall back to a downloadable `.tex` + a message. Loaded lazily only on editor / preview pages so it doesn't affect the rest of the app.
- **JD URL scraping**: per your answer, we store the URL but don't auto-scrape. Users paste the JD.
- **DeepSeek key**: you'll enter it in onboarding; stored encrypted, never sent to the browser.
- **Full build in one pass** is a large amount of work — I'll implement it in the order above, verifying each phase before moving on. Expect multiple build turns.
