
-- payment_events: allow workspace owners to read their own billing events
CREATE POLICY "Workspace owners can view own payment events"
ON public.payment_events
FOR SELECT
TO authenticated
USING (workspace_id IS NOT NULL AND public.owns_workspace(workspace_id));

-- user_roles: explicitly block client-side role modifications.
-- Role management must go through service_role (which bypasses RLS).
CREATE POLICY "Block client inserts on user_roles"
ON public.user_roles
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "Block client updates on user_roles"
ON public.user_roles
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Block client deletes on user_roles"
ON public.user_roles
FOR DELETE
TO authenticated, anon
USING (false);
