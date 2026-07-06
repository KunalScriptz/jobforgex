# Plan

Five separate changes. Each is scoped and independent.

## 1. Delete individual documents on a job
In the job detail dialog's Documents tab, add a trash icon next to each artifact row. Confirm via `AlertDialog`, then call a new `deleteJobArtifact` server function that removes the storage object and the `job_artifacts` row. Invalidate the job query.

## 2. Fix base-resume download filename
Downloads currently use the storage UUID. Change the download flow to fetch the bytes and re-save with:

```
{FirstName_LastName}_{Role}_base.tex   (or .pdf)
```

- Name: parsed from LaTeX source (existing `extractResumeName` helper).
- Role: from workspace profile (`primary_role` / job title stored at onboarding). If missing, omit.
- Suffix: always `_base` for the base resume.

Apply the same naming convention to the compiled PDF and to any "Download all" zip entry for the base resume. Tailored resumes keep the `{company}_{role}` naming they already use.

## 3. Edit an existing job
Add an "Edit" affordance on each job card / row and inside the job detail dialog header. Reuses the existing job form component (currently used for create) in edit mode:

- Prefills all fields from the job.
- Calls existing `updateJob` server function.
- Same validation as create.

## 4. Remove extra color palettes; keep light theme only
- Delete the palette switcher from `theme-toggle.tsx` (or reduce it to a no-op / hide).
- Remove `data-palette` selectors from `src/styles.css`.
- Force `light` as the only theme (remove dark toggle too, since the extra palettes were dark-mode-only and the user says they break LaTeX rendering / text contrast).
- Keep CSS variables clean so shadcn components still theme correctly.

## 5. Chrome extension: "JobForge Autofill"
New folder `extension/` at repo root. MV3 extension that:

- **Content script** runs on major job portals (Greenhouse, Lever, Ashby, Workday, LinkedIn Jobs, Indeed, generic `*careers*` / `*jobs*` pages).
- Shows a floating action button in the bottom-right. Clicking opens a small panel with:
  - **Save Job to Board** — scrapes `{company, title, url, description}` from the page (site-specific selectors + fallbacks) and POSTs to a new public endpoint `/api/public/extension/jobs`.
  - **Autofill Application** — reads the user's base resume fields (name, email, phone, links, experience bullets) from a new public endpoint `/api/public/extension/profile`, then fills matching form fields on the page by label / name / placeholder heuristics.
- **Auth**: extension popup has a "Connect" button. User pastes a personal API token generated in JobForge Settings (new `extension_tokens` table). Token stored in `chrome.storage.local`, sent as `Authorization: Bearer <token>` header.
- **Packaging**: zipped to `public/jobforge-extension.zip` via `nix run nixpkgs#zip`. Settings page gets a "Download Chrome extension" button + install instructions.

### Technical notes (per-piece)

**Backend additions**
- Table `extension_tokens (id, user_id, token_hash, label, created_at, last_used_at)` with RLS: users see own rows. Token shown once at generation.
- Server routes (public, verify bearer manually against hashed token):
  - `POST /api/public/extension/jobs` — creates a job in the user's default board.
  - `GET  /api/public/extension/profile` — returns safe autofill fields only (name, email, phone, links, current role, location). No resume LaTeX, no secrets.
- Server fns: `createExtensionToken`, `listExtensionTokens`, `revokeExtensionToken`.

**Filename helper**
Centralize `buildResumeFilename({ name, role, kind: 'base' | 'tailored', company?, ext })` in `src/lib/filenames.ts` and use it from resume download, PDF download, and zip export.

**Job edit form**
Extract the current inline create form in `jobs.tsx` into `JobFormDialog` accepting `{ mode: 'create' | 'edit', initial? }`.

**Theme cleanup**
Remove `next-themes` toggle UI (keep provider set to `light`). Delete palette CSS blocks. Keep this small — don't touch component styling logic.

### Out of scope
- Auto-generating tailored docs from the extension (user chose "save only" previously).
- Full WYSIWYG resume editing.
- Publishing extension to the Chrome Web Store — user side-loads the unpacked zip.

Confirm and I'll build it.
