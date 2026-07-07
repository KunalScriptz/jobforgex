import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function wsId(supabase: any, userId: string) {
  const { data } = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
  if (!data) throw new Error("Workspace not found");
  return data.id as string;
}

const StatusEnum = z.enum(["wishlist","applied","interview","rejected","offer"]);

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { board_id?: string | null; search?: string; status?: string | null }) =>
    z.object({
      board_id: z.string().uuid().optional().nullable(),
      search: z.string().optional(),
      status: StatusEnum.optional().nullable(),
    }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    let q = context.supabase.from("jobs").select("*").eq("workspace_id", id);
    if (data.board_id) q = q.eq("board_id", data.board_id);
    if (data.status) q = q.eq("status", data.status);
    if (data.search) {
      const s = data.search.replace(/,/g, " ");
      q = q.or(`company.ilike.%${s}%,title.ilike.%${s}%,notes.ilike.%${s}%,location.ilike.%${s}%`);
    }
    const { data: rows } = await q.order("created_at", { ascending: false });
    return rows ?? [];
  });

export const getJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from("jobs").select("*").eq("id", data.id).maybeSingle();
    const { data: artifacts } = await context.supabase.from("job_artifacts").select("*").eq("job_id", data.id).order("created_at");
    const { data: costs } = await context.supabase.from("ai_cost_logs").select("*").eq("job_id", data.id).order("created_at");
    return { job, artifacts: artifacts ?? [], costs: costs ?? [] };
  });

export const createJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    board_id: z.string().uuid(),
    company: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    description: z.string().max(100000).optional(),
    url: z.string().max(1000).optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
    location: z.string().max(200).optional().nullable(),
    status: StatusEnum.optional(),
    date_applied: z.string().optional().nullable(),
    resume_score: z.number().int().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { data: j, error } = await context.supabase.from("jobs").insert({
      workspace_id: id,
      board_id: data.board_id,
      company: data.company,
      title: data.title,
      description: data.description ?? "",
      url: data.url ?? null,
      notes: data.notes ?? null,
      location: data.location ?? null,
      status: data.status ?? "wishlist",
      date_applied: data.date_applied ?? null,
      resume_score: data.resume_score ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    return j;
  });

export const updateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    id: z.string().uuid(),
    company: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    url: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    status: StatusEnum.optional(),
    date_applied: z.string().nullable().optional(),
    board_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    await context.supabase.from("jobs").update(rest).eq("id", id);
    return { ok: true };
  });

export const deleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("jobs").delete().eq("id", data.id);
    return { ok: true };
  });

export const bulkUpdateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; status: string }) => z.object({
    ids: z.array(z.string().uuid()).min(1).max(200),
    status: StatusEnum,
  }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("jobs").update({ status: data.status }).in("id", data.ids);
    return { ok: true };
  });

export const bulkDeleteJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => z.object({
    ids: z.array(z.string().uuid()).min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    await context.supabase.from("jobs").delete().in("id", data.ids).eq("workspace_id", id);
    return { ok: true, count: data.ids.length };
  });