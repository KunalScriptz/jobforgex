
ALTER TABLE public.job_artifacts
  ADD COLUMN IF NOT EXISTS pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS compile_error text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS insights jsonb;

DROP POLICY IF EXISTS "workspace owners read job pdfs" ON storage.objects;
CREATE POLICY "workspace owners read job pdfs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-artifacts'
    AND public.owns_workspace(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "workspace owners write job pdfs" ON storage.objects;
CREATE POLICY "workspace owners write job pdfs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-artifacts'
    AND public.owns_workspace(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "workspace owners delete job pdfs" ON storage.objects;
CREATE POLICY "workspace owners delete job pdfs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'job-artifacts'
    AND public.owns_workspace(((storage.foldername(name))[1])::uuid)
  );
