
-- Workspace billing columns
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('INR','USD')),
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro')),
  ADD COLUMN IF NOT EXISTS trial_apps_limit INTEGER NOT NULL DEFAULT 2;

-- Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  plan_code TEXT NOT NULL,           -- e.g. 'pro_monthly_inr'
  cycle TEXT NOT NULL CHECK (cycle IN ('monthly','yearly')),
  currency TEXT NOT NULL CHECK (currency IN ('INR','USD')),
  rzp_subscription_id TEXT UNIQUE,
  rzp_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own subs"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (public.owns_workspace(workspace_id));

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON public.subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- Payment events (webhook audit / idempotency)
CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'razorpay',
  event_id TEXT NOT NULL UNIQUE,   -- rzp event id, for idempotency
  event_type TEXT NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.payment_events TO service_role;
-- No grants to anon/authenticated: webhook-only table.

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role touches this.

-- Entitlement helper
CREATE OR REPLACE FUNCTION public.has_active_pro(_ws UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE workspace_id = _ws
      AND status IN ('active','authenticated')
      AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;
