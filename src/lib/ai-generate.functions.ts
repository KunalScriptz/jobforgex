import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callDeepseek } from "./deepseek.server";

async function wsId(supabase: any, userId: string) {
  const { data } = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
  if (!data) throw new Error("Workspace not found");
  return data.id as string;
}

function stripFences(s: string) {
  return s.replace(/^```(?:latex|tex)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function sanitizeFilenamePart(s: string) {
  return s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "unknown";
}

export const scoreResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jd: string; resume_id?: string; model_id?: string | null; job_id?: string | null }) =>
    z.object({
      jd: z.string().min(30).max(100000),
      resume_id: z.string().uuid().optional(),
      model_id: z.string().uuid().optional().nullable(),
      job_id: z.string().uuid().optional().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let resume: any = null;
    if (data.resume_id) {
      const r = await context.supabase.from("resumes").select("*").eq("id", data.resume_id).maybeSingle();
      resume = r.data;
    } else {
      const r = await context.supabase.from("resumes").select("*").eq("workspace_id", id).eq("is_base", true).maybeSingle();
      resume = r.data;
    }
    if (!resume) throw new Error("No resume found. Complete onboarding first.");

    const result = await callDeepseek({
      supabase: context.supabase,
      admin: supabaseAdmin,
      workspaceId: id,
      userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "resume_scoring",
      jobId: data.job_id ?? null,
      promptName: "resume_scorer",
      vars: { jd: data.jd, resume_latex: resume.latex_source },
    });

    let parsed: any = null;
    try { parsed = JSON.parse(result.content); }
    catch {
      const m = result.content.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    if (!parsed) parsed = { score: 0, strengths: [], gaps: [], missing_keywords: [], missing_metrics: [], summary: "Could not parse model response." };
    return { report: parsed, cost: result.totalCost, model: result.modelName };
  });

export const tailorResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    jd: z.string().min(30).max(100000),
    company: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    model_id: z.string().uuid().optional().nullable(),
    job_id: z.string().uuid().optional().nullable(),
    resume_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let resume: any;
    if (data.resume_id) {
      resume = (await context.supabase.from("resumes").select("*").eq("id", data.resume_id).maybeSingle()).data;
    } else {
      resume = (await context.supabase.from("resumes").select("*").eq("workspace_id", id).eq("is_base", true).maybeSingle()).data;
    }
    if (!resume) throw new Error("No base resume found.");

    const result = await callDeepseek({
      supabase: context.supabase,
      admin: supabaseAdmin,
      workspaceId: id, userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "resume_tailoring",
      jobId: data.job_id ?? null,
      promptName: "tailor_resume",
      vars: { jd: data.jd, resume_latex: resume.latex_source, page_count: resume.page_count ?? 1 },
    });

    const latex = stripFences(result.content);
    const filename = `${sanitizeFilenamePart(data.company)}_${sanitizeFilenamePart(data.title)}_Tailored_Resume.tex`;
    return { latex, filename, cost: result.totalCost, model: result.modelName };
  });

export const generateCoverLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    jd: z.string().min(30).max(100000),
    company: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    model_id: z.string().uuid().optional().nullable(),
    job_id: z.string().uuid().optional().nullable(),
    resume_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let resume: any;
    if (data.resume_id) {
      resume = (await context.supabase.from("resumes").select("*").eq("id", data.resume_id).maybeSingle()).data;
    } else {
      resume = (await context.supabase.from("resumes").select("*").eq("workspace_id", id).eq("is_base", true).maybeSingle()).data;
    }
    if (!resume) throw new Error("No base resume found.");

    const result = await callDeepseek({
      supabase: context.supabase, admin: supabaseAdmin,
      workspaceId: id, userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "cover_letter",
      jobId: data.job_id ?? null,
      promptName: "generate_cover_letter",
      vars: { jd: data.jd, resume_latex: resume.latex_source, company: data.company, title: data.title },
    });

    const latex = stripFences(result.content);
    const filename = `${sanitizeFilenamePart(data.company)}_${sanitizeFilenamePart(data.title)}_Cover_Letter.tex`;
    return { latex, filename, cost: result.totalCost, model: result.modelName };
  });

export const saveArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    job_id: z.string().uuid(),
    kind: z.enum(["tailored_resume","cover_letter"]),
    filename: z.string().min(1).max(300),
    latex_source: z.string().min(10).max(500000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { data: a, error } = await context.supabase.from("job_artifacts").insert({
      workspace_id: id, job_id: data.job_id, kind: data.kind,
      filename: data.filename, latex_source: data.latex_source,
    }).select().single();
    if (error) throw new Error(error.message);
    return a;
  });

export const runAtsCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { resume_id?: string; model_id?: string | null }) =>
    z.object({ resume_id: z.string().uuid().optional(), model_id: z.string().uuid().optional().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let resume: any;
    if (data.resume_id) resume = (await context.supabase.from("resumes").select("*").eq("id", data.resume_id).maybeSingle()).data;
    else resume = (await context.supabase.from("resumes").select("*").eq("workspace_id", id).eq("is_base", true).maybeSingle()).data;
    if (!resume) throw new Error("No resume found.");

    const result = await callDeepseek({
      supabase: context.supabase, admin: supabaseAdmin,
      workspaceId: id, userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "ats_check", jobId: null,
      promptName: "ats_checker", vars: { resume_latex: resume.latex_source },
    });
    let parsed: any = null;
    try { parsed = JSON.parse(result.content); }
    catch { const m = result.content.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
    if (!parsed) parsed = { ats_score: 0, issues: [], recommendations: [] };
    return { report: parsed, cost: result.totalCost, model: result.modelName };
  });