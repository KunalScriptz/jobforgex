
-- Drop old (empty, workspace-scoped) subscription tables — being replaced.
DROP TABLE IF EXISTS public.payment_events;
DROP TABLE IF EXISTS public.subscriptions;

-- ============= subscriptions (per-user) =============
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','paid')),
  subscription_status text CHECK (subscription_status IN ('active','cancelled','past_due','halted','completed')),
  razorpay_customer_id text,
  razorpay_subscription_id text UNIQUE,
  current_period_end timestamptz,
  download_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies for authenticated → writes only via service role.

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= download_logs =============
CREATE TABLE public.download_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid,
  action text NOT NULL CHECK (action IN ('view','download')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.download_logs TO authenticated;
GRANT ALL ON public.download_logs TO service_role;

ALTER TABLE public.download_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own download logs"
  ON public.download_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_download_logs_user_created
  ON public.download_logs (user_id, created_at DESC);

-- ============= trigger: create free subscription on signup =============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.subscriptions (user_id, plan) VALUES (NEW.id, 'free')
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- The function existed but no trigger was attached; attach it now.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: create free subscription rows for existing users
INSERT INTO public.subscriptions (user_id, plan)
SELECT id, 'free' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ============= keep has_active_pro(_ws) working =============
-- Existing app code calls has_active_pro(_ws=workspace_id).
-- Repoint to the new per-user subscriptions table via workspace owner.
CREATE OR REPLACE FUNCTION public.has_active_pro(_ws uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN public.workspaces w ON w.owner_user_id = s.user_id
    WHERE w.id = _ws
      AND s.plan = 'paid'
      AND s.subscription_status = 'active'
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  );
$$;
