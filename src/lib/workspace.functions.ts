import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: ws } = await supabase.from("workspaces").select("*").eq("owner_user_id", userId).order("created_at").limit(1).maybeSingle();
    return ws;
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; timezone?: string }) =>
    z.object({ name: z.string().min(1).max(100), timezone: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // upsert-ish: only one workspace per user in this MVP
    const existing = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
    if (existing.data) return existing.data;

    const { data: ws, error } = await supabase.from("workspaces").insert({
      owner_user_id: userId,
      name: data.name,
      timezone: data.timezone ?? "UTC",
      onboarding_step: 2,
    }).select().single();
    if (error) throw new Error(error.message);

    // Default board only — AI provider is now server-managed.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("boards").insert({ workspace_id: ws.id, name: `${new Date().getFullYear()} Job Search` });

    return ws;
  });

export const updateOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { step: number; complete?: boolean }) =>
    z.object({ step: z.number().int().min(1).max(4), complete: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ws } = await supabase.from("workspaces").update({
      onboarding_step: data.step,
      onboarding_complete: data.complete ?? false,
    }).eq("owner_user_id", userId).select().single();
    return ws;
  });

export const listBoards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const ws = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
    if (!ws.data) return [];
    const { data } = await supabase.from("boards").select("*").eq("workspace_id", ws.data.id).order("created_at");
    return data ?? [];
  });

export const createBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string }) => z.object({ name: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ws = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
    if (!ws.data) throw new Error("No workspace");
    const { data: b, error } = await supabase.from("boards").insert({ workspace_id: ws.data.id, name: data.name }).select().single();
    if (error) throw new Error(error.message);
    return b;
  });

export const deleteBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("boards").delete().eq("id", data.id);
    return { ok: true };
  });

export const renameBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name: string }) =>
    z.object({ id: z.string().uuid(), name: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("boards").update({ name: data.name }).eq("id", data.id);
    return { ok: true };
  });

export const updateBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { monthly_budget_usd: number | null }) =>
    z.object({ monthly_budget_usd: z.number().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("workspaces").update({ monthly_budget_usd: data.monthly_budget_usd }).eq("owner_user_id", context.userId);
    return { ok: true };
  });