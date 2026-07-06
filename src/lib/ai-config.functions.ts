import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function loadWorkspaceId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
  if (!data) throw new Error("Workspace not found");
  return data.id as string;
}

export const getProvider = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await loadWorkspaceId(context.supabase, context.userId);
    const { data } = await context.supabase.from("ai_providers")
      .select("id, workspace_id, name, base_url, is_active, created_at")
      .eq("workspace_id", wsId).order("created_at").limit(1).maybeSingle();
    // Also indicate whether a key is stored (without returning it)
    let hasKey = false;
    if (data?.id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: raw } = await supabaseAdmin.from("ai_providers").select("api_key_encrypted").eq("id", data.id).maybeSingle();
      hasKey = Boolean(raw?.api_key_encrypted);
    }
    return data ? { ...data, has_key: hasKey } : null;
  });

export const saveProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { base_url: string; api_key?: string; name?: string }) =>
    z.object({
      base_url: z.string().url().max(500),
      api_key: z.string().max(500).optional(),
      name: z.string().max(100).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const wsId = await loadWorkspaceId(context.supabase, context.userId);
    const { encryptApiKey } = await import("./crypto.server");
    // Trim whitespace/newlines from pasted keys — a common source of 401s.
    const cleanKey = data.api_key?.trim() ?? "";
    if (cleanKey && cleanKey.length < 10) throw new Error("API key looks too short — paste the full key, then save again.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const existing = await supabaseAdmin.from("ai_providers").select("id").eq("workspace_id", wsId).maybeSingle();
    if (existing.error) throw new Error(`Could not load saved provider: ${existing.error.message}`);

    const patch: {
      base_url: string;
      name: string;
      is_active: boolean;
      api_key_encrypted?: string;
    } = {
      base_url: data.base_url,
      name: data.name ?? "DeepSeek",
      is_active: true,
    };
    if (cleanKey) patch.api_key_encrypted = encryptApiKey(cleanKey);

    if (existing.data) {
      const { error } = await supabaseAdmin.from("ai_providers").update(patch).eq("id", existing.data.id);
      if (error) throw new Error(`Could not save provider: ${error.message}`);
    } else {
      if (!cleanKey) throw new Error("Enter your API key before saving this provider.");
      const { error } = await supabaseAdmin.from("ai_providers").insert({
        workspace_id: wsId,
        ...patch,
      });
      if (error) throw new Error(`Could not save provider: ${error.message}`);
    }
    return { ok: true, key_updated: Boolean(cleanKey) };
  });

export const testConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { base_url: string; api_key: string; model: string }) =>
    z.object({ base_url: z.string().url(), api_key: z.string().min(10), model: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { pingDeepseek } = await import("./deepseek.server");
    await pingDeepseek(data.base_url.trim(), data.api_key.trim(), data.model.trim());
    return { ok: true };
  });

// Sends a real chat request to the *saved* provider using the given model id
// and returns the model's reply. Used by Settings > "Test model".
export const pingSavedModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { model: string }) => z.object({ model: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const wsId = await loadWorkspaceId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: provider } = await supabaseAdmin
      .from("ai_providers").select("*")
      .eq("workspace_id", wsId).eq("is_active", true)
      .order("created_at").limit(1).maybeSingle();
    if (!provider || !provider.api_key_encrypted) throw new Error("No provider saved. Enter and save your API key first.");
    let key: string;
    try {
      const { decryptApiKey } = await import("./crypto.server");
      key = decryptApiKey(provider.api_key_encrypted as string).trim();
    } catch (e: any) {
      throw new Error(
        `Could not decrypt saved API key (${e?.message ?? "unknown"}). ` +
        `Paste the full key and press Save & test to replace the stored key.`,
      );
    }
    const base = (provider.base_url as string).replace(/\/$/, "");
    const url = `${base}/chat/completions`;
    const masked = key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "****";
    console.log(`[pingSavedModel] POST ${url} model=${data.model} key=${masked} (len=${key.length})`);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: data.model,
          temperature: 0,
          max_tokens: 20,
          messages: [
            { role: "system", content: "Respond with exactly: hi model is working" },
            { role: "user", content: "ping" },
          ],
        }),
      });
    } catch (e: any) {
      throw new Error(`Network error calling ${url}: ${e?.message ?? e}`);
    }
    const text = await res.text();
    console.log(`[pingSavedModel] ← ${res.status} ${text.slice(0, 500)}`);
    if (!res.ok) {
      throw new Error(
        `Provider returned HTTP ${res.status} ${res.statusText}\n` +
        `URL: ${url}\nModel: ${data.model}\nKey: ${masked} (len ${key.length})\n\n` +
        `Body:\n${text.slice(0, 1200)}`,
      );
    }
    let reply = "";
    try { reply = JSON.parse(text)?.choices?.[0]?.message?.content ?? ""; } catch { reply = text.slice(0, 200); }
    return { reply: reply.trim() || "(empty response)", model: data.model };
  });

export const listModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await loadWorkspaceId(context.supabase, context.userId);
    const { data } = await context.supabase.from("ai_models").select("*").eq("workspace_id", wsId).order("created_at");
    return data ?? [];
  });

export const upsertModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(80),
    display_name: z.string().min(1).max(100),
    input_price_per_1m: z.number().min(0),
    output_price_per_1m: z.number().min(0),
    is_default: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const wsId = await loadWorkspaceId(context.supabase, context.userId);
    if (data.is_default) {
      await context.supabase.from("ai_models").update({ is_default: false }).eq("workspace_id", wsId);
    }
    if (data.id) {
      await context.supabase.from("ai_models").update({
        name: data.name, display_name: data.display_name,
        input_price_per_1m: data.input_price_per_1m,
        output_price_per_1m: data.output_price_per_1m,
        is_default: data.is_default ?? false,
      }).eq("id", data.id);
    } else {
      await context.supabase.from("ai_models").insert({
        workspace_id: wsId,
        name: data.name, display_name: data.display_name,
        input_price_per_1m: data.input_price_per_1m,
        output_price_per_1m: data.output_price_per_1m,
        is_default: data.is_default ?? false,
      });
    }
    return { ok: true };
  });

export const deleteModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("ai_models").delete().eq("id", data.id);
    return { ok: true };
  });