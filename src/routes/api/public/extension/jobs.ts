import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  company: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  url: z.string().max(1000).optional(),
  description: z.string().max(100000).optional(),
});

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...(init.headers ?? {}) },
  });
}

export const Route = createFileRoute("/api/public/extension/jobs")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") || "";
        const m = auth.match(/^Bearer\s+(\S+)$/i);
        if (!m) return json({ error: "Missing bearer token" }, { status: 401 });
        const token = m[1];
        if (!token.startsWith("jfx_")) return json({ error: "Invalid token format" }, { status: 401 });

        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) return json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = await sha256Hex(token);
        const { data: tok } = await supabaseAdmin
          .from("extension_tokens")
          .select("id,user_id,workspace_id")
          .eq("token_hash", hash)
          .maybeSingle();
        if (!tok) return json({ error: "Unknown token" }, { status: 401 });

        // Pick the first board in the workspace (default board created at onboarding).
        const { data: board } = await supabaseAdmin
          .from("boards")
          .select("id")
          .eq("workspace_id", tok.workspace_id)
          .order("created_at")
          .limit(1)
          .maybeSingle();
        if (!board) return json({ error: "No board found for workspace" }, { status: 400 });

        const { data: job, error } = await supabaseAdmin.from("jobs").insert({
          workspace_id: tok.workspace_id,
          board_id: board.id,
          company: parsed.data.company,
          title: parsed.data.title,
          url: parsed.data.url ?? null,
          description: parsed.data.description ?? "",
          status: "wishlist",
        }).select("id").single();
        if (error) return json({ error: error.message }, { status: 500 });

        await supabaseAdmin
          .from("extension_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", tok.id);

        return json({ ok: true, id: job.id });
      },
    },
  },
});