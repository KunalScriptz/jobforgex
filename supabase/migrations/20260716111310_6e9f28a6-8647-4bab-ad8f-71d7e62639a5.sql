
REVOKE EXECUTE ON FUNCTION public.has_active_pro(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_pro(UUID) TO service_role;
