
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS prompt_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.prompt_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.prompt_logs TO authenticated;
GRANT ALL ON public.prompt_logs TO service_role;

ALTER TABLE public.prompt_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own prompt logs" ON public.prompt_logs;
CREATE POLICY "Users can read their own prompt logs"
  ON public.prompt_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Atomic quota check + increment. Returns:
--   allowed boolean, reason text, remaining int, prompt_count int, is_paid boolean
CREATE OR REPLACE FUNCTION public.try_consume_prompt(_user_id uuid, _tool text)
RETURNS TABLE (allowed boolean, reason text, remaining integer, prompt_count integer, is_paid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_limit constant integer := 2;
  s_plan text;
  s_status text;
  s_end timestamptz;
  s_count integer;
  paid boolean;
BEGIN
  INSERT INTO public.subscriptions (user_id, plan)
  VALUES (_user_id, 'free')
  ON CONFLICT (user_id) DO NOTHING;

  SELECT plan, subscription_status, current_period_end, prompt_count
    INTO s_plan, s_status, s_end, s_count
  FROM public.subscriptions
  WHERE user_id = _user_id
  FOR UPDATE;

  paid := (s_plan = 'paid'
           AND (s_status = 'active' OR (s_end IS NOT NULL AND s_end > now())));

  IF paid THEN
    INSERT INTO public.prompt_logs (user_id, tool_name) VALUES (_user_id, _tool);
    RETURN QUERY SELECT true, 'ok'::text, NULL::int, s_count, true;
    RETURN;
  END IF;

  IF s_count >= free_limit THEN
    RETURN QUERY SELECT false, 'quota_reached'::text, 0, s_count, false;
    RETURN;
  END IF;

  UPDATE public.subscriptions
    SET prompt_count = prompt_count + 1, updated_at = now()
    WHERE user_id = _user_id
    RETURNING prompt_count INTO s_count;

  INSERT INTO public.prompt_logs (user_id, tool_name) VALUES (_user_id, _tool);

  RETURN QUERY SELECT true, 'ok'::text, GREATEST(free_limit - s_count, 0), s_count, false;
END;
$$;

REVOKE ALL ON FUNCTION public.try_consume_prompt(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.try_consume_prompt(uuid, text) TO authenticated, service_role;
