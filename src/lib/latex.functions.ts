import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Compile a LaTeX source to PDF via the public latexonline.cc service.
// Returns { pdf_base64 } on success, or throws with the compiler log on failure.
export const compileLatex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { source: string }) =>
    z.object({ source: z.string().min(10).max(500_000) }).parse(d),
  )
  .handler(async ({ data }) => {
    // Multipart upload: single file "main.tex", compiled with pdflatex.
    const boundary = "----lovable" + Math.random().toString(16).slice(2);
    const CRLF = "\r\n";
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="file"; filename="main.tex"${CRLF}` +
        `Content-Type: application/x-tex${CRLF}${CRLF}`,
    );
    const body = enc.encode(data.source);
    const tail = enc.encode(`${CRLF}--${boundary}--${CRLF}`);
    const payload = new Uint8Array(head.length + body.length + tail.length);
    payload.set(head, 0);
    payload.set(body, head.length);
    payload.set(tail, head.length + body.length);

    const url = "https://latexonline.cc/data?command=pdflatex&target=main.tex&force=true";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: payload,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `LaTeX compile failed (${res.status}). ${text.slice(0, 2000) || "No log available."}`,
      );
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    // Base64-encode for JSON transport back to the browser.
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    return { pdf_base64: b64 };
  });