ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS base_fit_score jsonb;
ALTER TABLE public.job_artifacts ADD COLUMN IF NOT EXISTS fit_score jsonb;