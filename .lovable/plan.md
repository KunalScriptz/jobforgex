## Resume Builder (v1)

New route `/_authenticated/builder/$jobId` living **alongside** the existing Generate flow. Entry points: a "Resume Builder" button on the job detail dialog + a new sidebar link. Generate stays as-is.

### Layout (matches the Huntr reference)

```
Left sidebar (editor)          Center                       Right sidebar (analysis)
┌──────────────────────┐       ┌────────────────────┐       ┌─────────────────────┐
│ AI Tailor | Editor   │       │ Suggested Edits |  │       │ Job Match | Score   │
│ | Layout & Style     │       │ PDF Preview        │       │ | Templates         │
├──────────────────────┤       │                    │       ├─────────────────────┤
│ + Target Job Title   │       │   [Live PDF        │       │ Poor Alignment 10   │
│ + Contact            │       │    rendered from   │       │ • Qualifications  0 │
│ + About              │       │    compiled LaTeX] │       │ • Responsibilities 0│
│ + Work Experience    │       │                    │       │ • Keywords        0 │
│ + Education          │       │                    │       │ • Job Title    100  │
│ + Skills / Projects  │       │                    │       │ [Run AI Tailor]     │
│ + Certs / Links      │       │                    │       │                     │
│ [Add Section]        │       │                    │       │                     │
└──────────────────────┘       └────────────────────┘       └─────────────────────┘
```

Top bar: `Resume Builder › Job Tailored Resumes › {Company @ Title}` breadcrumb, plus `Save as Base Resume`, `Undo`, `Download PDF`.

### Data model (structured JSON → LaTeX)

New table `builder_resumes` keyed by `(workspace_id, job_id)`:

- `content jsonb` — the structured resume document (schema below)
- `latex_source text` — last successfully compiled render (cached for preview + download)
- `pdf_path text` — Storage path to the last compiled PDF
- `job_match jsonb`, `score jsonb`, `suggestions jsonb` — analysis output
- Standard `created_at / updated_at`, RLS scoped to workspace owner, GRANTs per project rules.

`content` schema:
```ts
{
  target_title: string,
  contact: { name, email, phone?, location?, linkedin?, github?, website? },
  about?: string,               // Professional summary
  work: [{ company, title, location?, start, end?, bullets: string[] }],
  education: [{ school, degree, field?, start?, end?, details?: string[] }],
  skills: { group: string, items: string[] }[],
  projects: [{ name, link?, bullets: string[] }],
  certifications: [{ name, issuer?, date? }],
  links: [{ label, url }],
  volunteer: [{ org, role?, start?, end?, bullets: string[] }],
  section_order: string[]
}
```

Seeding: on first open of `/builder/$jobId`, if no row exists, seed `content` by parsing the workspace's Base Resume (LaTeX) with the existing DeepSeek/OpenRouter model into this JSON shape (new server fn `seedBuilderFromBase`), then compile once.

### LaTeX rendering pipeline

- New server-only renderer `renderBuilderLatex(content)` in `src/lib/builder-render.server.ts`. It composes the existing JobForge template (`src/config/resume-template.tex`) by injecting each section using the same custom commands (`\resumeSubheading`, `\resumeItem`, etc.) and escapes LaTeX-special characters (`% & _ # $ { } ~ ^ \`).
- Server fn `saveBuilderContent({ jobId, content })` — validates, persists JSON, re-renders LaTeX, compiles via existing `compileLatex`, stores PDF, returns `{ pdf_url, latex_source }`.
- Debounced autosave (~800 ms) on every field edit. PDF preview reuses `<LatexPreview>` with `downloadFilename` derived from `contact.name + company` (fixes the same random-filename bug pattern).

### Right panel (all three enabled in v1)

- **Job Match** — server fn `analyzeJobMatch({ jobId })` uses existing `extract_insights` + a new prompt that scores four buckets (Qualifications / Responsibilities / Keywords / Job Title) 0–100 with impact tags and a `not_covered` list per bucket. Rendered as accordions matching the screenshots.
- **Score** — server fn `analyzeResumeScore({ jobId })` returns Section Completion, Content Quality (metrics / repetitive verbs / repetitive bullets / buzzwords), Content Length. Section Completion is computed locally from `content` (no model call); Content Quality + Length go through the model.
- **Suggested Edits** — server fn `generateSuggestions({ jobId })` returns a list of `{ id, section, title, body, tags: ['Missing Info'|'Tailor Resume'|'Stay Relevant'], patch: { path, op, value } }`. Left panel "AI Tailor" tab renders them grouped by Section/Priority with **Apply / Edit / Ignore** buttons. Apply mutates `content` via the JSON patch, saves, recompiles.
- **Templates** tab: stub for v1 — shows current template only, "more coming soon".

Results are cached in the `builder_resumes` row and re-run on demand via "Re-analyze" (and automatically the first time a builder is opened for a job).

### Undo

Every save snapshots the previous `content` into a new `builder_resume_versions` table (mirrors existing `resume_versions`). `Undo` restores the most recent snapshot. Cap at 50 per resume.

### Entry points

- Sidebar: new "Resume Builder" nav link → jobs list scoped to "has base resume".
- Job detail dialog: new primary button **Open in Builder** next to existing Generate.
- Generate page: unchanged.

### Technical notes

- All server work uses `createServerFn` + `requireSupabaseAuth`; analysis calls reuse the current provider/model selection and log to `ai_cost_logs` with `purpose: 'builder_*'`.
- Route file: `src/routes/_authenticated/builder.$jobId.tsx` (loader `ensureQueryData` on `builder_resumes` + job).
- Reuse `LatexPreview`, `TailoringLoader`, existing color tokens; no new design tokens needed.
- Not in v1: template switcher, layout/style editor beyond color pickers (mirrors existing Base Resume colors), drag-reorder sections (order stored, buttons only), collaborative editing, Chrome-extension push.

### Files added
- `supabase/migrations/*_builder_resumes.sql`
- `src/routes/_authenticated/builder.$jobId.tsx`
- `src/components/builder/{Sidebar,Editor,Preview,JobMatchPanel,ScorePanel,SuggestedEdits,SectionCard}.tsx`
- `src/lib/builder.functions.ts`, `src/lib/builder-render.server.ts`
- `src/config/prompts/{builder_seed,job_match,resume_score,builder_suggestions}.yaml`

### Files changed
- `src/components/job-detail-dialog.tsx` — add "Open in Builder" button
- `src/components/app-shell.tsx` — add sidebar link