import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Compile a LaTeX source to PDF via a self-hosted TeX Live server.
// Set the LATEX_COMPILE_URL secret to your deployed endpoint
// (see /latex-server/README.md for a one-file Docker deploy on Fly/Render/VPS).
// Returns { pdf_base64 } on success, or throws with the compiler log on failure.
export const compileLatex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { source: string }) =>
    z.object({ source: z.string().min(10).max(500_000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const compileUrl = process.env.LATEX_COMPILE_URL;
    if (!compileUrl) {
      throw new Error(
        "LATEX_COMPILE_URL is not configured. Deploy the server in /latex-server (see its README) and add the URL as a secret.",
      );
    }

    const res = await fetch(compileUrl.replace(/\/$/, "") + "/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: data.source }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `LaTeX compile failed (${res.status}). ${text.slice(0, 4000) || "No log returned."}`,
      );
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return { pdf_base64: btoa(bin) };
  });