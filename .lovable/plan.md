
# JobForge — Architecture Overview (read-only)

Note on domain language: this app has no user-uploaded "applications" that get downloaded. What users download are **generated documents** — tailored resumes and cover letters produced by AI from a job description — stored as `job_artifacts` rows with an associated PDF in Supabase Storage. I've mapped your "application/download" questions onto that model.

---

## 1. AUTH

- **Provider**: Supabase Auth (email/password), wired via `@/integrations/supabase/client` (browser) and `@/integrations/supabase/auth-middleware` (server functions). No custom auth.
- **Sign-up flow** (`src/routes/auth.tsx`): `supabase.auth.signUp({ email, password, options: { data: { full_name } } })` → redirect to `/onboarding`.
- **On new user**: DB trigger `handle_new_user()` inserts a row into `public.user_roles (user_id, role='user')`. **No `profiles` table exists** — user identity is `auth.users.id` only; per-user app data lives on `workspaces`.
- **Workspace creation**: not automatic. `/onboarding` calls `createWorkspace` (`src/lib/workspace.functions.ts`), which inserts a `workspaces` row (`owner_user_id = auth.uid()`) and a default `boards` row. One workspace per user (MVP).
- **Session/user id access**:
  - Client: `supabase.auth.getUser()` (used in `_authenticated/route.tsx` gate + `auth.tsx`).
  - Server functions: `requireSupabaseAuth` middleware → `context.userId`, `context.supabase` (RLS-scoped), `context.claims`.
  - Bearer token attached to every server-fn call by `attachSupabaseAuth` registered in `src/start.ts`.
  - Root `onAuthStateChange` in `src/routes/__root.tsx` invalidates router + query cache on `SIGNED_IN/SIGNED_OUT/USER_UPDATED`.
- **Route gate**: `src/routes/_authenticated/route.tsx` (`ssr: false`) redirects unauthenticated users to `/auth`, and unless already on `/onboarding` requires `workspaces.onboarding_complete = true`.

---

## 2. DATABASE

All app tables live in `public`. Every user-data table is scoped by `workspace_id` and gated by RLS via the SECURITY DEFINER function `owns_workspace(_ws uuid)` (checks `workspaces.owner_user_id = auth.uid()`).

### Tables in use

| Table | Key columns | Relates to |
|---|---|---|
| `workspaces` | `id, owner_user_id → auth.users, name, timezone, monthly_budget_usd, onboarding_step, onboarding_complete, currency, plan ('free'/'pro'), trial_apps_limit` | User (1:1 in MVP) |
| `user_roles` | `id, user_id → auth.users, role (app_role enum)` | User; populated by `handle_new_user()` trigger |
| `boards` | `id, workspace_id, name` | Workspace |
| `jobs` | `id, workspace_id, board_id, company, title, description, url, notes, status, date_applied, resume_score, insights (jsonb), location, base_fit_score (jsonb)` | Board / Workspace |
| `job_artifacts` | `id, workspace_id, job_id, kind (enum: tailored_resume | cover_letter | ...), filename, latex_source, pdf_storage_path, compile_error, fit_score (jsonb)` | Job / Workspace — **this is the "downloadable application" record** |
| `resumes` | `id, workspace_id, name, latex_source, page_count, primary_color, secondary_color, is_base` | Workspace (base resume library) |
| `resume_versions` | history of `resumes` | Resume |
| `builder_resumes` / `builder_resume_versions` | interactive resume builder state | Job / Workspace |
| `ai_cost_logs` | `workspace_id, user_id, job_id, model_name, input/output_tokens, total_cost, purpose` | Workspace |
| `ai_models`, `ai_providers` | legacy per-workspace AI config (now unused; server uses `DEEPSEEK_API_KEY` env) | Workspace |
| `extension_tokens` | Chrome extension bearer tokens | User / Workspace |
| `subscriptions` | `workspace_id, provider, plan_code, cycle, currency, rzp_subscription_id, rzp_customer_id, status, current_period_end, cancel_at_period_end` | Workspace — **billing** |
| `payment_events` | `provider, event_id, event_type, workspace_id, payload, processed_at` | Workspace — **billing** |

### Foreign keys
No FKs declared to `public` tables in `information_schema.referential_constraints` (workspace scoping is enforced by RLS + app code, not FKs). `owner_user_id`/`user_id` columns reference `auth.users` conventionally.

### RLS policies (summary)
- **All workspace-scoped tables** (`jobs`, `job_artifacts`, `boards`, `resumes`, `resume_versions`, `builder_resumes`, `builder_resume_versions`, `ai_models`, `ai_providers`, `ai_cost_logs`): `USING owns_workspace(workspace_id)` for `ALL` (cost logs SELECT-only) to `authenticated`.
- `workspaces`: `owner_user_id = auth.uid()` (ALL).
- `extension_tokens`: `user_id = auth.uid()` (ALL).
- `subscriptions`: owner SELECT only. Writes happen via `supabaseAdmin` from webhooks (once wired).
- `payment_events`: owner SELECT only (workspace-scoped).
- `user_roles`: `read own roles` (SELECT `auth.uid() = user_id`); INSERT/UPDATE/DELETE blocked for anon+authenticated — only trigger/service role can write.
- **Storage (`storage.objects`)** — `job-artifacts` bucket: authenticated users can SELECT/INSERT/UPDATE/DELETE objects where the first path segment equals a workspace they own (`owns_workspace((storage.foldername(name))[1]::uuid)`).

### Helper DB functions
- `owns_workspace(_ws)` — SECURITY DEFINER, used in every RLS policy.
- `has_role(_user_id, _role)` — SECURITY DEFINER.
- `has_active_pro(_ws)` — returns true if a `subscriptions` row is `active|authenticated` and not expired. **This is the current source of truth for "is user on paid plan".**
- `handle_new_user()`, `set_updated_at()`.

---

## 3. APPLICATION (ARTIFACT) STORAGE

- **Bucket**: `job-artifacts` — **private** (see `<storage-buckets>`). Constant `BUCKET = "job-artifacts"` in `src/lib/pdf.functions.ts` and `src/lib/artifacts.functions.ts`.
- **Path structure**: `<workspace_id>/<artifact_id>.pdf` (one PDF per artifact, upsert on regeneration).
- **How an artifact + file get created** (`src/components/job-detail-dialog.tsx` → `DocumentsTab.gen`):
  1. `tailorResume` / `generateCoverLetter` server fn calls DeepSeek and returns `{ latex, filename, cost }`.
  2. `saveArtifact` inserts a row into `job_artifacts` (`latex_source` set, `pdf_storage_path` null).
  3. `compileArtifactPdf` (server fn, `src/lib/pdf.functions.ts`) POSTs the LaTeX to the external `LATEX_COMPILE_URL` service, uploads returned PDF bytes to `job-artifacts/<ws>/<artifact>.pdf` via the RLS-scoped user client (`context.supabase.storage.from(BUCKET).upload(...)`), then updates the row with `pdf_storage_path`. On failure, `compile_error` is written; no throw.

---

## 4. DOWNLOAD FLOW  ⭐

Two distinct paths — depending on whether the download is server-stored PDF or client-rendered from LaTeX/markdown.

### 4a. Stored PDF download (the main one)

Files: `src/components/job-detail-dialog.tsx` (`DocumentCard`, ~line 617+), server fn `getArtifactPdfUrl` in `src/lib/pdf.functions.ts`.

Step by step, user clicks "PDF" or "Preview" on a `DocumentCard`:
1. Component calls `useServerFn(getArtifactPdfUrl)` with `{ artifact_id, inline? }`.
2. `getArtifactPdfUrl` (server fn, `requireSupabaseAuth`):
   - Reads `job_artifacts` row with RLS-scoped client. If no `pdf_storage_path` → throws.
   - Calls `context.supabase.storage.from("job-artifacts").createSignedUrl(path, 600 /* 10 min */, download ? { download: pdfName } : undefined)`.
   - Returns `{ url, filename }`.
3. Browser navigates to / fetches that signed URL. Supabase serves the PDF (with `Content-Disposition: attachment; filename=…` when `download` param is set; inline when the Preview iframe uses it).

### 4b. "Download all (.zip)" bundle
`DocumentsTab.downloadAll` iterates artifacts, calls `getArtifactPdfUrl` per file, `fetch`es each signed URL client-side, packs with JSZip, triggers browser download. Also embeds `latex_source` as text where present.

### 4c. Client-rendered downloads
`src/lib/export-doc.ts` (`downloadAs(format, filename, content)`) generates `.txt`/`.pdf` (jsPDF)/`.docx` in the browser from LaTeX/markdown content — used for the `.tex`, `.txt` items on `DocumentCard` and for AI tool output. **No server round-trip, no quota surface today.**

### Existing limit/tracking
- **No download-side counter or gate exists.** No table records downloads; `getArtifactPdfUrl` has no rate/quota check.
- The only enforcement anywhere is at **generation time**: `assertCanGenerate(admin, workspaceId, jobId)` in `src/lib/entitlement.server.ts`, called by `tailorResume` / `generateCoverLetter` / etc. It counts **distinct `job_id`s** in `job_artifacts` with `kind IN ('tailored_resume','cover_letter')` against `workspaces.trial_apps_limit` (default 2), unless `workspaces.plan = 'pro'` or `has_active_pro(ws)` returns true. Throws sentinel `"PAYMENT_REQUIRED"` (`PAYWALL_ERROR`), which the client detects via `isPaywallError` in `src/components/paywall-dialog.tsx`.
- Existing telemetry: `ai_cost_logs` (per generation, not per download).

### View-only flow (separate from download)
Yes: **Preview** button on `DocumentCard` (also at ~line 850). It calls `getArtifactPdfUrl({ artifact_id, inline: true })` (no `{ download }` param → served inline) and renders the signed URL in an iframe inside a dialog. Same server fn, same signed URL mechanism — the only difference is the `inline` flag skipping `Content-Disposition: attachment`. **Preview shares the exact same code path as download.**

---

## 5. EXISTING BILLING / PLAN LOGIC

Substantial scaffolding is present but not yet wired to a payment provider:

- **Schema**:
  - `workspaces.plan` (`'free' | 'pro'`), `workspaces.trial_apps_limit` (int, default 2), `workspaces.currency`.
  - `subscriptions` table with Razorpay-flavoured columns (`rzp_subscription_id`, `rzp_customer_id`, `cycle`, `status`, `current_period_end`, `cancel_at_period_end`).
  - `payment_events` (`provider`, `event_id`, `event_type`, `payload`) for webhook idempotency.
  - DB function `has_active_pro(_ws)`.
- **Server**:
  - `src/lib/entitlement.server.ts` — `assertCanGenerate`, called from `ai-generate.functions.ts` and `ai-tools.functions.ts` (search these files for the sentinel to confirm every gated entry point).
  - `src/lib/billing.functions.ts` — `getBillingStatus` server fn returns `{ plan, currency, trial_used, trial_limit, has_pro, current_period_end, cycle, cancel_at_period_end }`.
- **UI**:
  - `src/routes/_authenticated/billing.tsx` — plan tiers page (Starter / Pro Monthly / Pro Yearly), auto currency detection (INR/USD).
  - `src/components/paywall-dialog.tsx` — shown on `PAYMENT_REQUIRED` errors, links to `/billing`.
- **Not yet built**: no Razorpay webhook route, no checkout handler; `subscriptions` rows are not populated from any code path currently visible.

---

## 6. FRONTEND STRUCTURE

- **Router**: TanStack Start (`src/router.tsx`, file-based routes in `src/routes/`). Root shell at `src/routes/__root.tsx`. Protected subtree under `src/routes/_authenticated/` gated by `_authenticated/route.tsx`.
- **App shell / sidebar**: `src/components/app-shell.tsx` (workspace name, theme toggle, sign out, nav to `/jobs`, `/resumes`, `/generate`, `/checker`, `/builder`, `/settings`, `/billing`).
- **Job list & download UI**:
  - `src/routes/_authenticated/jobs.tsx` — Kanban board; clicking a card opens…
  - `src/components/job-detail-dialog.tsx` — huge file (~1187 lines) containing `DocumentsTab`, `DocumentCard`, Preview iframe, `Download PDF`, `Download all (.zip)`, `.tex`/`.txt`/`.docx` menu items. **This is where every download button lives** (with the small exception of AI-tool output downloads later in the same file at ~line 1131).
- **User/session state**: no central `useAuth`/context. Instead:
  - `_authenticated/route.tsx` calls `supabase.auth.getUser()` and returns `{ user }` in route context. Child routes rarely read it — most rely on server functions using `requireSupabaseAuth`, so identity lives server-side.
  - Workspace info fetched ad-hoc via `getMyWorkspace` (`src/lib/workspace.functions.ts`) — used in `app-shell.tsx`, `onboarding.tsx`, etc.
  - Billing status fetched via `getBillingStatus` on `/billing` — **not currently prefetched globally**.

There is no shared "current user + plan" hook today; each surface queries what it needs.

---

## Where to hook a subscription/quota check on downloads (recommendation)

Because **all stored-PDF downloads funnel through one server function** — `getArtifactPdfUrl` in `src/lib/pdf.functions.ts` — that is the single chokepoint for gating downloads without touching UI. Any check placed there covers:
- Individual PDF download from `DocumentCard`
- Preview iframe (same fn, `inline: true`)
- "Download all (.zip)" (calls the fn per artifact)

Client-rendered exports (`downloadAs` in `src/lib/export-doc.ts` for `.tex`/`.txt`/`.docx` and AI-tool markdown) bypass the server entirely — if those need to count against a download quota, they must be routed through a new server fn (e.g. `recordDownload`) or a middleware call before the browser action.

For a per-user download quota you'd want:
- A new `download_events` table (`workspace_id, artifact_id, user_id, kind, created_at`), workspace-scoped RLS, service-role writes, plus a `downloads_this_period(_ws)` DB function mirroring `has_active_pro`.
- An `assertCanDownload(admin, workspaceId, artifactId)` helper in `src/lib/entitlement.server.ts` in the same shape as `assertCanGenerate`, thrown-error sentinel reused so `PaywallDialog` already handles it.
- Call `assertCanDownload` at the top of `getArtifactPdfUrl.handler`, and record a `download_events` row after `createSignedUrl` succeeds.
- Extend `getBillingStatus` to include `downloads_used` / `downloads_limit` for the UI.
- Optionally add a shared `useBillingStatus()` React Query hook so the download button can disable itself pre-emptively (no functional loss — the server still enforces).

No existing component or route needs to change for enforcement to work: throwing `PAYMENT_REQUIRED` from `getArtifactPdfUrl` will bubble through `useServerFn` and can be caught with the same `isPaywallError` helper the generation buttons already use — just add that catch in `DocumentCard`'s download handler and in `downloadAll`.
