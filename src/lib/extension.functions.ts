import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `jfx_${hex}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function wsId(supabase: any, userId: string) {
  const { data } = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
  if (!data) throw new Error("Workspace not found");
  return data.id as string;
}

export const listExtensionTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("extension_tokens")
      .select("id,label,token_prefix,last_used_at,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const createExtensionToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { label?: string }) =>
    z.object({ label: z.string().min(1).max(60).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const wsid = await wsId(context.supabase, context.userId);
    const token = randomToken();
    const hash = await sha256Hex(token);
    const prefix = token.slice(0, 10);
    const { error } = await context.supabase.from("extension_tokens").insert({
      user_id: context.userId,
      workspace_id: wsid,
      label: data.label ?? "Chrome extension",
      token_hash: hash,
      token_prefix: prefix,
    });
    if (error) throw new Error(error.message);
    return { token };
  });

export const revokeExtensionToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("extension_tokens").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });