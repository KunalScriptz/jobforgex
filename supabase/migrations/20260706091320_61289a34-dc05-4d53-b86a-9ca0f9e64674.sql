
CREATE TABLE public.extension_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Chrome extension',
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extension_tokens TO authenticated;
GRANT ALL ON public.extension_tokens TO service_role;

ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own extension tokens"
  ON public.extension_tokens
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX extension_tokens_hash_idx ON public.extension_tokens (token_hash);
