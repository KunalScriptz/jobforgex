
DROP FUNCTION IF EXISTS public.try_consume_prompt(uuid, text);

CREATE FUNCTION public.try_consume_prompt(_user_id uuid, _tool text)
RETURNS TABLE (allowed boolean, reason text, remaining integer, used integer, is_paid boolean)
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

  SELECT s.plan, s.subscription_status, s.current_period_end, s.prompt_count
    INTO s_plan, s_status, s_end, s_count
  FROM public.subscriptions s
  WHERE s.user_id = _user_id
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

  UPDATE public.subscriptions s
    SET prompt_count = s.prompt_count + 1, updated_at = now()
    WHERE s.user_id = _user_id
    RETURNING s.prompt_count INTO s_count;

  INSERT INTO public.prompt_logs (user_id, tool_name) VALUES (_user_id, _tool);

  RETURN QUERY SELECT true, 'ok'::text, GREATEST(free_limit - s_count, 0), s_count, false;
END;
$$;

REVOKE ALL ON FUNCTION public.try_consume_prompt(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.try_consume_prompt(uuid, text) TO service_role;
