import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callDeepseek } from "./deepseek.server";

async function wsId(supabase: any, userId: string) {
  const { data } = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
  if (!data) throw new Error("Workspace not found");
  return data.id as string;
}

export type JobInsights = {
  keywords: string[];
  hard_skills: string[];
  soft_skills: string[];
  responsibilities: string[];
  qualifications: string[];
  seniority?: string;
  remote?: string;
  visa_sponsorship?: "yes" | "no" | "unknown" | string;
  visa_notes?: string;
  summary?: string;
};

/**
 * Extract structured insights from a job's description.
 * If `force` is false and the job already has insights, returns them unchanged.
 */
export const extractJobInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { job_id: string; force?: boolean; model_id?: string | null }) =>
    z.object({
      job_id: z.string().uuid(),
      force: z.boolean().optional().default(false),
      model_id: z.string().uuid().optional().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { data: job } = await context.supabase.from("jobs").select("*").eq("id", data.job_id).maybeSingle();
    if (!job) throw new Error("Job not found");
    if (!data.force && job.insights) return { insights: job.insights as JobInsights, cost: 0, cached: true };
    if (!job.description || job.description.length < 40) {
      throw new Error("Job description is too short to analyze.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await callDeepseek({
      supabase: context.supabase, admin: supabaseAdmin,
      workspaceId: id, userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "custom", jobId: data.job_id,
      promptName: "extract_insights" as any,
      vars: { jd: job.description },
    });

    let parsed: any = null;
    try { parsed = JSON.parse(result.content); }
    catch {
      const m = result.content.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch {}
    }
    if (!parsed) throw new Error("Could not parse insights JSON from model.");

    // Normalize
    const insights: JobInsights = {
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 40).map(String) : [],
      hard_skills: Array.isArray(parsed.hard_skills) ? parsed.hard_skills.slice(0, 20).map(String) : [],
      soft_skills: Array.isArray(parsed.soft_skills) ? parsed.soft_skills.slice(0, 10).map(String) : [],
      responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities.slice(0, 15).map(String) : [],
      qualifications: Array.isArray(parsed.qualifications) ? parsed.qualifications.slice(0, 15).map(String) : [],
      seniority: typeof parsed.seniority === "string" ? parsed.seniority : undefined,
      remote: typeof parsed.remote === "string" ? parsed.remote : undefined,
      visa_sponsorship: typeof parsed.visa_sponsorship === "string" ? parsed.visa_sponsorship : undefined,
      visa_notes: typeof parsed.visa_notes === "string" ? parsed.visa_notes.slice(0, 400) : undefined,
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 500) : undefined,
    };

    await context.supabase.from("jobs").update({ insights }).eq("id", data.job_id);
    return { insights, cost: result.totalCost, cached: false };
  });