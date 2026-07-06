import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function wsId(supabase: any, userId: string) {
  const { data } = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
  if (!data) throw new Error("Workspace not found");
  return data.id as string;
}

function guessPages(src: string): number {
  const breaks = (src.match(/\\newpage|\\pagebreak|\\clearpage/g) ?? []).length;
  const bodyLen = src.length;
  // heuristic: >20k chars ≈ 2 pages, >35k ≈ 3
  if (breaks > 0) return breaks + 1;
  if (bodyLen > 35000) return 3;
  if (bodyLen > 20000) return 2;
  return 1;
}

export const listResumes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { data } = await context.supabase.from("resumes").select("*").eq("workspace_id", id).order("created_at", { ascending: false });
    return data ?? [];
  });

export const getResume = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r } = await context.supabase.from("resumes").select("*").eq("id", data.id).maybeSingle();
    return r;
  });

export const getBaseResume = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { data } = await context.supabase.from("resumes").select("*").eq("workspace_id", id).eq("is_base", true).maybeSingle();
    return data;
  });

export const saveBaseResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { latex_source: string; primary_color?: string; secondary_color?: string }) =>
    z.object({
      latex_source: z.string().min(50).max(200000),
      primary_color: z.string().max(40).optional(),
      secondary_color: z.string().max(40).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const pages = guessPages(data.latex_source);
    const existing = await context.supabase.from("resumes").select("id").eq("workspace_id", id).eq("is_base", true).maybeSingle();
    if (existing.data) {
      // save previous version
      const { data: prev } = await context.supabase.from("resumes").select("latex_source").eq("id", existing.data.id).maybeSingle();
      if (prev) await context.supabase.from("resume_versions").insert({
        resume_id: existing.data.id, workspace_id: id, latex_source: prev.latex_source, note: "auto-save",
      });
      await context.supabase.from("resumes").update({
        latex_source: data.latex_source,
        page_count: pages,
        primary_color: data.primary_color ?? undefined,
        secondary_color: data.secondary_color ?? undefined,
      }).eq("id", existing.data.id);
      return { id: existing.data.id };
    } else {
      const { data: r, error } = await context.supabase.from("resumes").insert({
        workspace_id: id, name: "Base Resume", is_base: true,
        latex_source: data.latex_source, page_count: pages,
        primary_color: data.primary_color ?? "0.0,0.65,0.60",
        secondary_color: data.secondary_color ?? "0.0,0.0,0.55",
      }).select().single();
      if (error) throw new Error(error.message);
      return { id: r.id };
    }
  });

export const updateResumeColors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; primary_color: string; secondary_color: string; latex_source: string }) =>
    z.object({
      id: z.string().uuid(),
      primary_color: z.string(),
      secondary_color: z.string(),
      latex_source: z.string().min(50).max(200000),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("resumes").update({
      primary_color: data.primary_color,
      secondary_color: data.secondary_color,
      latex_source: data.latex_source,
    }).eq("id", data.id);
    return { ok: true };
  });

export const listVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { resume_id: string }) => z.object({ resume_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: v } = await context.supabase.from("resume_versions").select("*").eq("resume_id", data.resume_id).order("created_at", { ascending: false }).limit(50);
    return v ?? [];
  });

export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { version_id: string }) => z.object({ version_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: v } = await context.supabase.from("resume_versions").select("*").eq("id", data.version_id).maybeSingle();
    if (!v) throw new Error("Version not found");
    await context.supabase.from("resumes").update({ latex_source: v.latex_source }).eq("id", v.resume_id);
    return { ok: true };
  });