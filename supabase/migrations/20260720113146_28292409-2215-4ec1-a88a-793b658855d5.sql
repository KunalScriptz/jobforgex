
-- 1. plans catalog
CREATE TABLE public.plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  monthly_price_usd integer NOT NULL DEFAULT 0, -- cents
  annual_price_usd integer NOT NULL DEFAULT 0,  -- cents
  job_track_limit integer,      -- null = unlimited
  cover_letter_limit integer,   -- null = unlimited
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans are publicly readable" ON public.plans FOR SELECT USING (true);

INSERT INTO public.plans (id, name, monthly_price_usd, annual_price_usd, job_track_limit, cover_letter_limit, features, sort_order) VALUES
  ('free', 'Starter', 0, 0, 3, 1,
    '["3 job tracks","1 cover letter / month","Basic resume tailoring","Chrome extension"]'::jsonb, 1),
  ('pro', 'Pro', 1400, 9900, 30, NULL,
    '["30 active job tracks","Unlimited cover letters","AI resume tailoring + insights","Resume fit score","PDF & LaTeX exports","Priority support"]'::jsonb, 2),
  ('unlimited', 'Unlimited', 2900, 24900, NULL, NULL,
    '["Unlimited job tracks","Unlimited AI generations","All Pro features","Early access to new tools","Priority queue"]'::jsonb, 3);

-- 2. geo pricing
CREATE TABLE public.geo_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  country_code text NOT NULL, -- ISO-2, or 'DEFAULT' for USD anchor
  currency text NOT NULL,     -- ISO-4217
  currency_symbol text NOT NULL DEFAULT '$',
  monthly_price integer NOT NULL, -- minor units (cents / paise)
  annual_price integer NOT NULL,
  razorpay_plan_id_monthly text,
  razorpay_plan_id_annual text,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, country_code)
);

GRANT SELECT ON public.geo_pricing TO anon, authenticated;
GRANT ALL ON public.geo_pricing TO service_role;
ALTER TABLE public.geo_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Geo pricing is publicly readable" ON public.geo_pricing FOR SELECT USING (true);

-- Seed: DEFAULT (USD anchor) + IN + GB + EU + AU + CA + SG for pro & unlimited
INSERT INTO public.geo_pricing (plan_id, country_code, currency, currency_symbol, monthly_price, annual_price, priority) VALUES
  -- Pro
  ('pro', 'DEFAULT', 'USD', '$',   1400,  9900, 0),
  ('pro', 'IN',      'INR', '₹',  59900, 399900, 10),
  ('pro', 'GB',      'GBP', '£',   1100,  7900, 10),
  ('pro', 'DE',      'EUR', '€',   1300,  8900, 10),
  ('pro', 'FR',      'EUR', '€',   1300,  8900, 10),
  ('pro', 'AU',      'AUD', 'A$',  2100, 14900, 10),
  ('pro', 'CA',      'CAD', 'C$',  1900, 13900, 10),
  ('pro', 'SG',      'SGD', 'S$',  1900, 13900, 10),
  -- Unlimited
  ('unlimited', 'DEFAULT', 'USD', '$',   2900, 24900, 0),
  ('unlimited', 'IN',      'INR', '₹', 129900, 999900, 10),
  ('unlimited', 'GB',      'GBP', '£',   2300, 19900, 10),
  ('unlimited', 'DE',      'EUR', '€',   2700, 22900, 10),
  ('unlimited', 'FR',      'EUR', '€',   2700, 22900, 10),
  ('unlimited', 'AU',      'AUD', 'A$',  4300, 36900, 10),
  ('unlimited', 'CA',      'CAD', 'C$',  3900, 33900, 10),
  ('unlimited', 'SG',      'SGD', 'S$',  3900, 33900, 10);

-- 3. Extend subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_id text REFERENCES public.plans(id),
  ADD COLUMN IF NOT EXISTS billing_cycle text CHECK (billing_cycle IN ('monthly','annual')),
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lifetime_deal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz;

-- Backfill from legacy `plan` column ('free' | 'paid')
UPDATE public.subscriptions
   SET plan_id = CASE WHEN plan = 'paid' THEN 'pro' ELSE 'free' END,
       billing_cycle = CASE WHEN plan = 'paid' THEN 'monthly' END
 WHERE plan_id IS NULL;

ALTER TABLE public.subscriptions
  ALTER COLUMN plan_id SET DEFAULT 'free',
  ALTER COLUMN plan_id SET NOT NULL;
