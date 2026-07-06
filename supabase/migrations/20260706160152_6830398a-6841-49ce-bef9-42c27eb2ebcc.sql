CREATE TABLE public.builder_resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  latex_source text,
  pdf_path text,
  job_match jsonb,
  score jsonb,
  suggestions jsonb,
  primary_color text DEFAULT '0.0,0.65,0.60',
  secondary_color text DEFAULT '0.0,0.0,0.55',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, job_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.builder_resumes TO authenticated;
GRANT ALL ON public.builder_resumes TO service_role;

ALTER TABLE public.builder_resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage builder_resumes"
  ON public.builder_resumes FOR ALL
  TO authenticated
  USING (public.owns_workspace(workspace_id))
  WITH CHECK (public.owns_workspace(workspace_id));

CREATE TRIGGER builder_resumes_updated_at
  BEFORE UPDATE ON public.builder_resumes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX builder_resumes_workspace_idx ON public.builder_resumes(workspace_id);
CREATE INDEX builder_resumes_job_idx ON public.builder_resumes(job_id);


CREATE TABLE public.builder_resume_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_resume_id uuid NOT NULL REFERENCES public.builder_resumes(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  content jsonb NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.builder_resume_versions TO authenticated;
GRANT ALL ON public.builder_resume_versions TO service_role;

ALTER TABLE public.builder_resume_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage builder_resume_versions"
  ON public.builder_resume_versions FOR ALL
  TO authenticated
  USING (public.owns_workspace(workspace_id))
  WITH CHECK (public.owns_workspace(workspace_id));

CREATE INDEX builder_resume_versions_resume_idx ON public.builder_resume_versions(builder_resume_id, created_at DESC);