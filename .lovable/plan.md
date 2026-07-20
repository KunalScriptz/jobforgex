
# JobForge Pricing, Billing & Anti-Abuse Rework (revised)

Razorpay-only (INR + international). Existing create-subscription + webhook plumbing kept; catalog, geo pricing, feature limits, and abuse signals layered on top. Existing paying users keep working.

Verified `subscriptions` current shape:
`plan text default 'free'` (values today: `'free'` / `'paid'`), plus `subscription_status`, `razorpay_customer_id`, `razorpay_subscription_id`, `current_period_end`, `download_count`, `prompt_count`.

---

## Phase 1 — Catalog + geo pricing page

### 1.1 Migration

New tables:
- `plans (id text pk, name, monthly_price_usd int cents, annual_price_usd int cents, job_track_limit int, cover_letter_limit int, features jsonb, is_active bool, created_at)`
- `geo_pricing (id uuid pk, plan_id fk, country_code text, currency text, monthly_price int, annual_price int, razorpay_plan_id_monthly text null, razorpay_plan_id_annual text null, priority int, created_at, unique(plan_id, country_code))`

Seed all rows from §1.3 of the spec. Public read (`anon` + `authenticated` SELECT) since it's a pricing catalog.

Extend `subscriptions`:
- `plan_id text default 'free'` (fk plans)
- `billing_cycle text` (`monthly` | `annual`)
- `cancel_at_period_end bool default false`
- `trial_ends_at timestamptz`
- `suspended bool default false`
- `lifetime_deal bool default false`
- `provider text default 'razorpay'`
- `current_period_start timestamptz`

**Backfill (verified against live schema):**
```sql
UPDATE public.subscriptions
   SET plan_id = CASE WHEN plan = 'paid' THEN 'pro' ELSE 'free' END,
       billing_cycle = CASE WHEN plan = 'paid' THEN 'monthly' END;
```
Legacy `plan` column kept (nullable, non-authoritative) for one release, then dropped.

### 1.2 Country + pricing serverFns (`src/lib/geo.functions.ts`)

- `detectCountry()` — public. Reads `cf-ipcountry` → `x-vercel-ip-country` → `ipapi.co` fallback. Cookie `preferred_country` (30d) set client-side.
- `getPricing({ country_code?, currency? })` — public. Joins `geo_pricing` → `plans`; USD anchor fallback when no row matches. Returns all three plans with monthly + annual + currency symbol.

### 1.3 Pricing page rewrite (`src/routes/_authenticated/billing.tsx`)

- Country/currency dropdown (auto-selected, persisted in localStorage).
- Monthly/Annual toggle (client-only; both prices in payload).
- Three cards driven by `getPricing`.
- Annual cards show "$X/mo billed annually ($Y/yr)".
- **Discount badge computed from the actual numbers:** `round((1 - annual/12/monthly) * 100)%` — no hardcoded "40%". Hidden if <15%.
- "Start 7-day free trial" CTA on Pro Annual only.
- Existing usage/current-plan card kept above.

### 1.4 Checkout routing (`src/lib/razorpay.functions.ts`)

Extend `createSubscription`:
- Input: `{ plan_id: 'pro'|'unlimited', billing_cycle: 'monthly'|'annual', country_code, trial?: boolean }`
- Look up `geo_pricing` for (plan, country) → pick `razorpay_plan_id_monthly|annual`.
- **Missing plan-id handling:** if the resolved column is `null`, throw a typed error `PLAN_NOT_CONFIGURED` with message *"This plan isn't available in your region yet — try changing currency or contact support."* UI shows a toast, no stack trace. Falls back to USD-anchor row before erroring.
- `trial_period_days: 7` sent only when `billing_cycle='annual'` and `plan_id='pro'` and `trial=true`. **Note:** requires the underlying Razorpay Plan to have trial enabled at creation — I'll flag this when you paste IDs so you can confirm the trial flag on the annual Pro plan.
- Stores `plan_id` + `billing_cycle` on the pre-recorded subscription row.

**Plan IDs from you:** you paste them and I run a small SQL update per row (or wire a temporary admin form). Until then, only Free works; paid buttons render a "Coming soon in your region" state where the id is null.

---

## Phase 2 — Webhooks, limits, LTD, portal

### 2.1 Webhook (`src/routes/api/public/razorpay-webhook.ts`)

Extend existing verified handler:
- `subscription.charged` → `plan_id`, `subscription_status='active'`, roll periods, honor `billing_cycle`, clear `trial_ends_at`.
- `subscription.cancelled` / `.completed` → `plan_id='free'`, clear provider fields.
- `payment.failed` → `subscription_status='past_due'`.
- `subscription.updated` → sync period + cycle + `cancel_at_period_end`.
- All events appended to new `payment_events (id, event, subscription_id, payload jsonb, received_at)` for debugging.

### 2.2 Feature gating

- `usage_counters (user_id, feature, count, period_start, period_end, unique(user_id, feature, period_start))`.
- SQL `consume_feature(_user_id, _feature)` → auto-rolls monthly period; respects `lifetime_deal` + active pro/unlimited; returns `{allowed, remaining, limit}`.
- Retire `try_consume_prompt` at call sites. Free tier now: 3 job tracks + 1 cover letter/month + basic tailoring. Pro: 30 tracks + unlimited CL. Unlimited: no caps.
- 402s route through existing `PaywallDialog`.

### 2.3 Lifetime deal

- `ltd_codes (id, code unique, plan_id default 'pro', redeemed_by, redeemed_at)`.
- `redeemLtd({ code })` — atomic claim + upgrade.
- Small "Redeem code" input at bottom of billing page.

### 2.4 Portal

- Razorpay has no hosted customer portal.
- "Cancel subscription" button → `POST /v1/subscriptions/:id/cancel` (server-side).
- "Update payment method" → link to Razorpay subscription `short_url` stored at creation.

---

## Phase 3 — Anti-abuse (passive; sessions is the only hard block)

### 3.1 Sessions (hard cap 3)

- `user_sessions (id, user_id, session_token, device_fingerprint, ip_address, user_agent, last_active_at, created_at)`.
- `registerSession` on app load + 5-min heartbeat. LRU eviction; current-session 401 with security-language toast.

### 3.2 Auth UI (`src/routes/auth.tsx`)

- "Continue with Google" primary; email/password kept, de-emphasized below divider.
- Post-login banner for password-only users → `supabase.auth.linkIdentity({ provider: 'google' })`. Dismissible, one-time.

### 3.3 Signals (flag, don't block)

- `@fingerprintjs/fingerprintjs` on login; visitorId → `user_sessions.device_fingerprint`.
- Tables: `login_audit_log`, `user_flags`, `base_resume_history`.
- ServerFns: `detectIpAnomaly` (500km/10min), `detectContentAbuse` (base-resume only, SHA-256 first 1000 chars, ≥3 distinct/30d), `detectMultiCity` (≥3 cities/7d).
- Device audit every 6h via pg_cron → `/api/public/hooks/audit-devices`. **pg_cron requires Supabase Pro/Team.** If you're on free, I'll skip the cron and expose a manual "Run audit now" admin button; enabling later is one migration.
- Admin `/admin/flags` gated by `has_role(uid,'admin')`.

### 3.4 Suspension

- `requireSupabaseAuth` extended: `subscriptions.suspended=true` → 403.

---

## Delivery order

One phase per approval:

1. **Phase 1 migration** (catalog + geo pricing + `subscriptions` extension + backfill).
2. Phase 1 UI + `getPricing`/`detectCountry` + checkout routing with graceful null-plan-id fallback.
3. You paste Razorpay Plan IDs → I run seed update. Confirm annual Pro plan has trial enabled in Razorpay.
4. Phase 2 (webhooks/limits/LTD/portal).
5. Phase 3 (sessions → auth UI → signals → admin; cron only if pg_cron available).

Confirm and I'll start with the Phase 1 migration.
