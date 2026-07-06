import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "job-artifacts";

export const deleteJobArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { artifact_id: string }) =>
    z.object({ artifact_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: art } = await context.supabase
      .from("job_artifacts")
      .select("id,pdf_storage_path")
      .eq("id", data.artifact_id)
      .maybeSingle();
    if (!art) throw new Error("Artifact not found");

    if (art.pdf_storage_path) {
      try {
        await context.supabase.storage.from(BUCKET).remove([art.pdf_storage_path]);
      } catch {
        // ignore storage cleanup failures — the DB row is the source of truth
      }
    }

    const { error } = await context.supabase
      .from("job_artifacts")
      .delete()
      .eq("id", art.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });