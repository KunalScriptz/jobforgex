## Recommendation

Move tailored resume + cover letter generation into the **job detail page** as the primary home. That is where the job description, company context, and existing documents already live, so generating docs there keeps everything in one place.

Keep the **Generate page** as a quick-action hub, but change it from a freeform paste form into a **saved-job picker**. You select a job from your board, choose which documents to create (resume + cover letter), and generate both in parallel.

## Why this fits your workflow

1. Chrome extension saves jobs → they land on your board.
2. When you are ready to apply, you open the job card and generate documents right there.
3. If you prefer a dedicated generation page, the Generate tab lets you pick any saved job and produce both documents at once (or just one).

## Plan

### 1. Add "Generate Documents" to job detail
- New action in the job detail dialog (Documents tab or a dedicated button).
- Pick which documents to create: Tailored Resume and/or Cover Letter.
- Reuses existing `tailorResume` and `generateCoverLetter` server functions.
- Generated artifacts are saved to that job automatically and appear in the Documents tab immediately.

### 2. Refactor Generate page into a Saved-Job picker
- Remove the freeform Company/Title/URL/JD form.
- Replace it with a job selector (dropdown or searchable list of your saved jobs).
- Keep the "Generate tailored resume" and "Generate cover letter" checkboxes.
- Clicking "Generate" runs the same server functions against the selected job.
- New artifacts are saved to that job and you are redirected to the job detail (or shown a success link).

### 3. Generate both at the same time
- The existing backend already supports parallel generation.
- Keep dual checkboxes in both locations (job detail and Generate page).
- Both documents compile to PDF in parallel after generation.

## What stays the same
- AI Tools tab inside job detail remains for plain-text outputs (follow-up emails, interview prep, etc.).
- The board and drag-drop workflow does not change.
- Resume scoring can still be triggered from wherever generation lives.

## What is removed
- The "paste any JD" freeform flow on the Generate page. All generation requires a saved job, which aligns with your Chrome-extension workflow.