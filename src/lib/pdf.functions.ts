import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "job-artifacts";

async function wsId(supabase: any, userId: string) {
  const { data } = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
  if (!data) throw new Error("Workspace not found");
  return data.id as string;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function compileToPdf(source: string): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  const url = process.env.LATEX_COMPILE_URL;
  if (!url) return { ok: false, error: "LATEX_COMPILE_URL is not configured on the server." };
  try {
    const res = await fetch(url.replace(/\/$/, "") + "/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Compile failed (${res.status}): ${text.slice(0, 1500)}` };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return { ok: true, bytes: buf };
  } catch (e: any) {
    return { ok: false, error: `Compile request failed: ${e?.message ?? String(e)}` };
  }
}

/**
 * Compile an artifact's LaTeX to PDF and upload it to storage.
 * Idempotent: overwrites any existing PDF at the same path.
 * Records compile_error on failure but never throws (so it's safe to call in the background).
 */
export const compileArtifactPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { artifact_id: string }) =>
    z.object({ artifact_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const wsid = await wsId(context.supabase, context.userId);
    const { data: art } = await context.supabase
      .from("job_artifacts").select("*").eq("id", data.artifact_id).maybeSingle();
    if (!art) throw new Error("Artifact not found");
    if (!art.latex_source || art.latex_source.length < 10) {
      throw new Error("Artifact has no LaTeX source to compile.");
    }

    const result = await compileToPdf(art.latex_source);
    if (!result.ok) {
      await context.supabase.from("job_artifacts")
        .update({ compile_error: result.error }).eq("id", art.id);
      return { ok: false, error: result.error };
    }

    const path = `${wsid}/${art.id}.pdf`;
    const { error: upErr } = await context.supabase.storage
      .from(BUCKET)
      .upload(path, result.bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      await context.supabase.from("job_artifacts")
        .update({ compile_error: `Storage upload failed: ${upErr.message}` }).eq("id", art.id);
      return { ok: false, error: upErr.message };
    }

    await context.supabase.from("job_artifacts")
      .update({ pdf_storage_path: path, compile_error: null }).eq("id", art.id);

    return { ok: true, storage_path: path };
  });

/** Return a short-lived signed URL for downloading the artifact's PDF. */
export const getArtifactPdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { artifact_id: string }) =>
    z.object({ artifact_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: art } = await context.supabase
      .from("job_artifacts").select("id,pdf_storage_path,filename").eq("id", data.artifact_id).maybeSingle();
    if (!art?.pdf_storage_path) throw new Error("No PDF stored for this artifact yet.");
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET).createSignedUrl(art.pdf_storage_path, 60 * 10); // 10 min
    if (error) throw new Error(error.message);
    const pdfName = (art.filename ?? "document").replace(/\.tex$/i, "") + ".pdf";
    return { url: signed.signedUrl, filename: pdfName };
  });

// re-exported so callers can await both bytes generation and export
export { b64ToBytes };