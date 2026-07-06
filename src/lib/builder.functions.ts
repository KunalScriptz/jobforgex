import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callDeepseek } from "./deepseek.server";
import { renderBuilderLatex, applyPatch, type BuilderContent } from "./builder-render.server";

async function wsId(supabase: any, userId: string) {
  const { data } = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
  if (!data) throw new Error("Workspace not found");
  return data.id as string;
}

function tryParseJson(s: string): any {
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// -------- Load or seed a builder resume for a job --------

export const getOrSeedBuilder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { job_id: string; model_id?: string | null }) =>
    z.object({
      job_id: z.string().uuid(),
      model_id: z.string().uuid().optional().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Existing row?
    const existing = await context.supabase
      .from("builder_resumes").select("*")
      .eq("workspace_id", id).eq("job_id", data.job_id).maybeSingle();
    if (existing.data) return existing.data;

    // 2. Seed from base resume via LLM.
    const { data: base } = await context.supabase
      .from("resumes").select("*")
      .eq("workspace_id", id).eq("is_base", true).maybeSingle();
    if (!base) throw new Error("No base resume found. Complete onboarding first.");

    const result = await callDeepseek({
      supabase: context.supabase, admin: supabaseAdmin,
      workspaceId: id, userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "builder_seed", jobId: data.job_id,
      promptName: "builder_seed",
      vars: { resume_latex: base.latex_source ?? "" },
    });

    const parsed = tryParseJson(result.content) ?? {};
    // Copy the target job title into the seed so the header/heading match.
    const { data: job } = await context.supabase.from("jobs").select("title,company").eq("id", data.job_id).maybeSingle();
    if (job?.title) parsed.target_title = job.title;

    const latex = renderBuilderLatex(parsed);
    const { data: row, error } = await context.supabase.from("builder_resumes").insert({
      workspace_id: id, job_id: data.job_id,
      content: parsed, latex_source: latex,
      primary_color: base.primary_color, secondary_color: base.secondary_color,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

// -------- Save (autosave) — writes content, re-renders LaTeX, snapshots undo --------

export const saveBuilderContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { job_id: string; content: BuilderContent }) =>
    z.object({
      job_id: z.string().uuid(),
      content: z.any(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { data: row } = await context.supabase
      .from("builder_resumes").select("id, content, primary_color, secondary_color")
      .eq("workspace_id", id).eq("job_id", data.job_id).maybeSingle();
    if (!row) throw new Error("Builder resume not found — open the builder first.");

    // Snapshot previous content for undo.
    await context.supabase.from("builder_resume_versions").insert({
      builder_resume_id: row.id, workspace_id: id, content: row.content, note: "autosave",
    });

    // Trim history to 50.
    const { data: extras } = await context.supabase
      .from("builder_resume_versions").select("id")
      .eq("builder_resume_id", row.id).order("created_at", { ascending: false }).range(50, 999);
    if (extras?.length) {
      await context.supabase.from("builder_resume_versions").delete().in("id", extras.map(e => e.id));
    }

    const latex = renderBuilderLatex(data.content, {
      primary_color: row.primary_color ?? undefined,
      secondary_color: row.secondary_color ?? undefined,
    });
    await context.supabase.from("builder_resumes")
      .update({ content: data.content, latex_source: latex })
      .eq("id", row.id);

    return { ok: true, latex_source: latex };
  });

// -------- Undo --------

export const undoBuilder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { job_id: string }) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { data: row } = await context.supabase.from("builder_resumes")
      .select("id, primary_color, secondary_color")
      .eq("workspace_id", id).eq("job_id", data.job_id).maybeSingle();
    if (!row) throw new Error("Builder resume not found.");
    const { data: last } = await context.supabase
      .from("builder_resume_versions").select("*")
      .eq("builder_resume_id", row.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!last) throw new Error("Nothing to undo.");

    const latex = renderBuilderLatex(last.content, {
      primary_color: row.primary_color ?? undefined,
      secondary_color: row.secondary_color ?? undefined,
    });
    await context.supabase.from("builder_resumes")
      .update({ content: last.content, latex_source: latex })
      .eq("id", row.id);
    await context.supabase.from("builder_resume_versions").delete().eq("id", last.id);
    return { content: last.content, latex_source: latex };
  });

// -------- Analysis: Job Match --------

export const analyzeJobMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { job_id: string; model_id?: string | null }) =>
    z.object({
      job_id: z.string().uuid(),
      model_id: z.string().uuid().optional().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await context.supabase.from("builder_resumes")
      .select("id, content").eq("workspace_id", id).eq("job_id", data.job_id).maybeSingle();
    if (!row) throw new Error("Open the builder first.");
    const { data: job } = await context.supabase.from("jobs").select("*").eq("id", data.job_id).maybeSingle();
    if (!job?.description || job.description.length < 30) throw new Error("Job has no description.");

    const result = await callDeepseek({
      supabase: context.supabase, admin: supabaseAdmin,
      workspaceId: id, userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "builder_job_match", jobId: data.job_id,
      promptName: "builder_job_match",
      vars: { jd: job.description, title: job.title, resume_json: JSON.stringify(row.content) },
    });
    const parsed = tryParseJson(result.content) ?? { overall: 0, overall_label: "Poor", buckets: {} };
    await context.supabase.from("builder_resumes").update({ job_match: parsed }).eq("id", row.id);
    return { job_match: parsed, cost: result.totalCost };
  });

// -------- Analysis: Resume Score --------

function sectionCompletion(content: BuilderContent) {
  const checks: Array<{ label: string; ok: boolean }> = [
    { label: "First / Last Name", ok: !!content.contact?.name?.trim() },
    { label: "Email", ok: !!content.contact?.email?.trim() },
    { label: "Phone Number", ok: !!content.contact?.phone?.trim() },
    { label: "Location", ok: !!content.contact?.location?.trim() },
    { label: "Work Experience", ok: (content.work ?? []).length > 0 },
    { label: "Education", ok: (content.education ?? []).length > 0 },
    { label: "Summary", ok: !!content.about?.trim() },
    { label: "Skills", ok: (content.skills ?? []).some(s => (s.items ?? []).length > 0) },
  ];
  const passed = checks.filter(c => c.ok).length;
  const score = Math.round((passed / checks.length) * 100);
  return { score, checks };
}

export const analyzeResumeScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { job_id: string; model_id?: string | null }) =>
    z.object({
      job_id: z.string().uuid(),
      model_id: z.string().uuid().optional().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await context.supabase.from("builder_resumes")
      .select("id, content").eq("workspace_id", id).eq("job_id", data.job_id).maybeSingle();
    if (!row) throw new Error("Open the builder first.");

    const section = sectionCompletion(row.content as BuilderContent);

    const result = await callDeepseek({
      supabase: context.supabase, admin: supabaseAdmin,
      workspaceId: id, userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "builder_score", jobId: data.job_id,
      promptName: "builder_score",
      vars: { resume_json: JSON.stringify(row.content) },
    });
    const parsed = tryParseJson(result.content) ?? {};
    const overall = Math.round(
      (section.score + (parsed?.content_quality?.score ?? 0) + (parsed?.content_length?.score ?? 0)) / 3,
    );
    const score = { overall, section, content_quality: parsed?.content_quality, content_length: parsed?.content_length };
    await context.supabase.from("builder_resumes").update({ score }).eq("id", row.id);
    return { score, cost: result.totalCost };
  });

// -------- Analysis: Suggestions --------

export const generateSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { job_id: string; model_id?: string | null }) =>
    z.object({
      job_id: z.string().uuid(),
      model_id: z.string().uuid().optional().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await context.supabase.from("builder_resumes")
      .select("id, content").eq("workspace_id", id).eq("job_id", data.job_id).maybeSingle();
    if (!row) throw new Error("Open the builder first.");
    const { data: job } = await context.supabase.from("jobs").select("*").eq("id", data.job_id).maybeSingle();
    if (!job?.description || job.description.length < 30) throw new Error("Job has no description.");

    const result = await callDeepseek({
      supabase: context.supabase, admin: supabaseAdmin,
      workspaceId: id, userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "builder_suggestions", jobId: data.job_id,
      promptName: "builder_suggestions",
      vars: { jd: job.description, title: job.title, resume_json: JSON.stringify(row.content) },
    });
    const parsed = tryParseJson(result.content) ?? { suggestions: [] };
    await context.supabase.from("builder_resumes").update({ suggestions: parsed }).eq("id", row.id);
    return { suggestions: parsed, cost: result.totalCost };
  });

// -------- Apply / Ignore a suggestion --------

export const applySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { job_id: string; suggestion_id: string; patch?: any }) =>
    z.object({
      job_id: z.string().uuid(),
      suggestion_id: z.string(),
      patch: z.any().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { data: row } = await context.supabase.from("builder_resumes")
      .select("id, content, suggestions, primary_color, secondary_color")
      .eq("workspace_id", id).eq("job_id", data.job_id).maybeSingle();
    if (!row) throw new Error("Builder not found.");
    const sugContainer: any = row.suggestions ?? {};
    const patch = data.patch
      ?? (sugContainer.suggestions ?? []).find((s: any) => s.id === data.suggestion_id)?.patch;
    if (!patch) throw new Error("Suggestion patch not found.");

    // Snapshot previous.
    await context.supabase.from("builder_resume_versions").insert({
      builder_resume_id: row.id, workspace_id: id, content: row.content, note: `apply:${data.suggestion_id}`,
    });

    const newContent = applyPatch(row.content as unknown as BuilderContent, patch);
    const latex = renderBuilderLatex(newContent, {
      primary_color: row.primary_color ?? undefined,
      secondary_color: row.secondary_color ?? undefined,
    });

    // Remove the applied suggestion from the list.
    const remaining = {
      ...sugContainer,
      suggestions: (sugContainer.suggestions ?? []).filter((s: any) => s.id !== data.suggestion_id),
    };
    await context.supabase.from("builder_resumes")
      .update({ content: newContent, latex_source: latex, suggestions: remaining })
      .eq("id", row.id);
    return { content: newContent, latex_source: latex, suggestions: remaining };
  });

export const ignoreSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { job_id: string; suggestion_id: string }) =>
    z.object({
      job_id: z.string().uuid(),
      suggestion_id: z.string(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { data: row } = await context.supabase.from("builder_resumes")
      .select("id, suggestions").eq("workspace_id", id).eq("job_id", data.job_id).maybeSingle();
    if (!row) throw new Error("Builder not found.");
    const sugContainer: any = row.suggestions ?? {};
    const remaining = {
      ...sugContainer,
      suggestions: (sugContainer.suggestions ?? []).filter((s: any) => s.id !== data.suggestion_id),
    };
    await context.supabase.from("builder_resumes").update({ suggestions: remaining }).eq("id", row.id);
    return { suggestions: remaining };
  });

// -------- Save-as-base — promote the builder content back to the base resume --------

export const saveBuilderAsBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { job_id: string }) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { data: row } = await context.supabase.from("builder_resumes")
      .select("latex_source").eq("workspace_id", id).eq("job_id", data.job_id).maybeSingle();
    if (!row?.latex_source) throw new Error("Nothing to save.");
    const { data: base } = await context.supabase.from("resumes")
      .select("id, latex_source").eq("workspace_id", id).eq("is_base", true).maybeSingle();
    if (!base) throw new Error("No base resume to overwrite.");
    await context.supabase.from("resume_versions").insert({
      resume_id: base.id, workspace_id: id, latex_source: base.latex_source, note: "builder-save-as-base",
    });
    await context.supabase.from("resumes").update({ latex_source: row.latex_source }).eq("id", base.id);
    return { ok: true };
  });