// Server-only entitlement gate for AI generation.
// Free trial = `workspaces.trial_apps_limit` distinct jobs with generated artifacts.
// Pro (active subscription via has_active_pro) = unlimited.

export const PAYWALL_ERROR = "PAYMENT_REQUIRED";

export async function assertCanGenerate(
  admin: any,
  workspaceId: string,
  jobId: string | null | undefined,
): Promise<void> {
  const { data: ws } = await admin
    .from("workspaces")
    .select("plan, trial_apps_limit")
    .eq("id", workspaceId)
    .maybeSingle();
  if (ws?.plan === "pro") return;

  const { data: isPro } = await admin.rpc("has_active_pro", { _ws: workspaceId });
  if (isPro === true) return;

  const { data: rows } = await admin
    .from("job_artifacts")
    .select("job_id")
    .eq("workspace_id", workspaceId)
    .in("kind", ["tailored_resume", "cover_letter"]);

  const distinctJobs = new Set(
    (rows ?? []).map((r: any) => r.job_id).filter((v: any): v is string => !!v),
  );
  // Regenerating for a job already in the trial doesn't consume a new slot.
  if (jobId && distinctJobs.has(jobId)) return;

  const limit = Number(ws?.trial_apps_limit ?? 2);
  if (distinctJobs.size >= limit) {
    throw new Error(PAYWALL_ERROR);
  }
}