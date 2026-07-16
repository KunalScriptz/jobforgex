
## Goal
Ship JobForge for public launch: monetize via Razorpay subscriptions, hide all AI‑provider plumbing from end users, remove internal cost dashboards, and gate document generation behind a free‑trial + Pro subscription with local currency.

## 1. Monetization model

- **Free trial**: every new user gets **2 applications** free.
  - 1 application = 1 job's tailored resume **+** 1 cover letter for that job (either or both counts as consuming that job's slot; a job never costs more than 1).
  - Counter is per‑workspace, based on distinct `job_id`s that have any generated artifact.
- **Pro plan** (single tier, two cycles):
  - Monthly: ₹499 / $6.99
  - Yearly: ₹4,999 / $59 (≈2 months free)
  - Unlimited applications, resume scoring, ATS checks, cover letters, chat‑with‑resume, Chrome extension.
- **Currency**: auto‑detect. India (IP/timezone `Asia/*` + India, or Razorpay customer country = IN) → INR. Everyone else → USD. Stored on workspace so it's stable after first detection.

## 2. Razorpay integration (BYO account)

- Add secrets via `add_secret`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- Also `VITE_RAZORPAY_KEY_ID` (public, safe) for the Checkout script.
- User creates 4 **Plans** in Razorpay dashboard (Pro‑Monthly‑INR, Pro‑Yearly‑INR, Pro‑Monthly‑USD, Pro‑Yearly‑USD). We store the plan IDs as secrets or a small config table.
- Flow: **Razorpay Subscriptions** API (recurring) — not one‑off orders.
  - `POST /subscriptions` server fn → returns subscription id.
  - Client loads `https://checkout.razorpay.com/v1/checkout.js` and opens Checkout with that subscription id.
  - On success handler → server verifies signature → marks subscription active.
- Webhook route: `src/routes/api/public/razorpay-webhook.ts` handles `subscription.activated`, `subscription.charged`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`. Verifies HMAC‑SHA256 with `RAZORPAY_WEBHOOK_SECRET` before writing.

## 3. Database (single migration)

New tables:
- `subscriptions` (workspace_id, provider='razorpay', plan_code, cycle, currency, rzp_subscription_id, rzp_customer_id, status, current_period_end, cancel_at_period_end, created/updated_at)
- `payment_events` (raw webhook log, idempotency by rzp event id)

Workspace additions:
- `workspaces.currency` ('INR'|'USD'), `workspaces.plan` ('free'|'pro'), `workspaces.trial_apps_limit` default 2.

RLS + GRANTs per template rules. Server‑definer helper `has_active_pro(_ws uuid)` used by an entitlement check.

## 4. Entitlement gate (server side)

Central helper `assertCanGenerate({ workspace_id, job_id })` invoked at the top of:
- `tailorResume`, `generateCoverLetter`, `chatWithArtifact` (when it modifies).

Logic:
1. If `has_active_pro(ws)` → allow.
2. Else count `distinct job_id` in `job_artifacts` for workspace. If `< 2` OR `job_id` already among those distinct ids → allow. Otherwise throw `PAYMENT_REQUIRED` error with message "Free trial used up — upgrade to Pro".

`scoreResume`, `runAtsCheck` stay free (they don't produce artifacts). Rationale: they help users decide before spending a slot.

## 5. Remove user‑facing AI provider UI

- Delete `ProviderCard`, `ModelsCard`, `BudgetCard` from `settings.tsx`. Keep only `ExtensionCard` + `BoardsCard` + new `BillingCard`.
- Remove Step 2 (AI provider) from `onboarding.tsx`. New flow: Step 1 workspace → Step 2 base resume. Update `updateOnboardingStep` schema (max 3).
- Delete `src/routes/_authenticated/costs.tsx` and its `Costs` nav entry in `app-shell.tsx`.
- Server fns kept but no longer user‑configurable: `getProvider`/`saveProvider`/`testConnection`/`pingSavedModel`/`upsertModel`/`deleteModel` stay for internal use only or get deleted (delete to reduce surface).
- `deepseek.server.ts` + `ai-generate.functions.ts` + `chatWithArtifact` + `builder-render.server.ts`: replace per‑workspace provider lookup with a single platform key.
  - Read `process.env.DEEPSEEK_API_KEY` and `process.env.DEEPSEEK_BASE_URL` (default `https://api.deepseek.com/v1`) and `process.env.DEEPSEEK_MODEL` (default `deepseek-chat`) inside handlers.
  - Cost logging still runs to `ai_cost_logs` for admin audit (not exposed in UI).

## 6. Billing UI

- New route `src/routes/_authenticated/billing.tsx` with:
  - Current plan card (Free trial: "1 of 2 free applications used"; Pro: "Active until DD MMM YYYY, manage").
  - Two Pro cards (Monthly / Yearly) with prices in detected currency, "Upgrade" button opening Razorpay Checkout.
  - Cancel subscription button (calls `POST /subscriptions/:id/cancel`, cancel at cycle end).
- Add "Billing" to sidebar in `app-shell.tsx` (replacing "Costs").
- Paywall dialog component: shown when `PAYMENT_REQUIRED` is thrown from Tailor/Cover Letter buttons in `job-detail-dialog.tsx` and `generate.tsx`. Uses same Upgrade CTA.

## 7. Currency detection

- On workspace creation (or first call if null): server fn reads `CF-IPCountry` / `x-vercel-ip-country` from request headers, falls back to timezone; sets `workspaces.currency`.
- All price strings formatted with `Intl.NumberFormat(locale, { style:'currency', currency })`.

## 8. Files touched

**New**
- `supabase/migrations/<ts>_billing.sql`
- `src/lib/billing.functions.ts` (create subscription, cancel, get status, entitlement)
- `src/lib/razorpay.server.ts` (SDK wrapper, HMAC verify)
- `src/routes/api/public/razorpay-webhook.ts`
- `src/routes/_authenticated/billing.tsx`
- `src/components/paywall-dialog.tsx`
- `src/components/upgrade-cta.tsx`

**Edited**
- `src/routes/_authenticated/settings.tsx` — drop Provider/Models/Budget cards; add Billing link.
- `src/routes/onboarding.tsx` — remove Step 2; renumber.
- `src/components/app-shell.tsx` — remove Costs, add Billing.
- `src/lib/deepseek.server.ts` — platform key.
- `src/lib/ai-generate.functions.ts` — call `assertCanGenerate` in tailor/coverletter/chat‑modify.
- `src/lib/builder-render.server.ts`, `src/lib/insights.functions.ts` — switch to platform key.
- `src/lib/workspace.functions.ts` — currency detection; onboarding step max 3; drop `updateBudget`.

**Deleted**
- `src/routes/_authenticated/costs.tsx`
- `src/lib/costs.functions.ts`
- `src/lib/ai-config.functions.ts` (or trimmed to nothing)

## 9. Secrets to add (before build)

Request from you via secure form:
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `VITE_RAZORPAY_KEY_ID` (same as key id, non‑secret publishable)
- `DEEPSEEK_API_KEY` (your platform key)
- `RAZORPAY_PLAN_ID_MONTHLY_INR`, `RAZORPAY_PLAN_ID_YEARLY_INR`, `RAZORPAY_PLAN_ID_MONTHLY_USD`, `RAZORPAY_PLAN_ID_YEARLY_USD`

## 10. Verification

- Playwright: sign up new user → generate 2 applications → 3rd Tailor click shows paywall.
- Manual Razorpay test‑mode purchase → webhook lands → workspace flips to Pro → 3rd generation now succeeds.
- Cancel → workspace stays Pro until `current_period_end`.
- INR vs USD switch by faking `CF-IPCountry` header.

## Out of scope (deferred)
- Proration / plan switching mid‑cycle.
- Team seats.
- Refund workflow (handled manually in Razorpay dashboard).
- GST invoices (Razorpay auto‑generates on Indian accounts).
