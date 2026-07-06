import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import RESUME_TEMPLATE_TEX from "@/config/resume-template.tex?raw";
import { decryptApiKey } from "./crypto.server";

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

// -------- Convert pasted PDF-extracted plain text into JobForge LaTeX --------

export const convertPdfTextToLatex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string; model_id?: string | null }) =>
    z.object({
      text: z.string().min(80, "Extracted PDF text is too short — try a text-based PDF.").max(60_000),
      model_id: z.string().uuid().optional().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const wsId = await (async () => {
      const { data: w } = await context.supabase.from("workspaces").select("id").eq("owner_user_id", context.userId).maybeSingle();
      if (!w) throw new Error("Workspace not found");
      return w.id as string;
    })();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve model
    let model: any = null;
    if (data.model_id) {
      const { data: m } = await context.supabase.from("ai_models").select("*").eq("id", data.model_id).eq("workspace_id", wsId).maybeSingle();
      model = m;
    }
    if (!model) {
      const { data: m } = await context.supabase.from("ai_models").select("*").eq("workspace_id", wsId).eq("is_default", true).maybeSingle();
      model = m;
    }
    if (!model) {
      const { data: m } = await context.supabase.from("ai_models").select("*").eq("workspace_id", wsId).order("created_at").limit(1).maybeSingle();
      model = m;
    }
    if (!model) throw new Error("No AI model configured. Add one in Settings.");

    const { data: provider } = await supabaseAdmin
      .from("ai_providers").select("*")
      .eq("workspace_id", wsId).eq("is_active", true)
      .order("created_at").limit(1).maybeSingle();
    if (!provider?.api_key_encrypted) throw new Error("AI provider not configured. Add your API key in Settings.");

    let apiKey: string;
    try { apiKey = decryptApiKey(provider.api_key_encrypted as string).trim(); }
    catch (e: any) { throw new Error(`Could not decrypt saved API key (${e?.message}). Re-save it in Settings.`); }

    const system = [
      "You convert a raw resume (plain text extracted from a PDF) into a LaTeX resume that EXACTLY follows the template provided below.",
      "",
      "Hard rules:",
      "1. Output ONLY the LaTeX source. No markdown fences, no commentary, no ``` blocks. Start with \\documentclass and end with \\end{document}.",
      "2. Keep the entire preamble, \\usepackage lines, color definitions, \\titleformat, and all \\newcommand macros IDENTICAL to the template. Do not add or remove packages.",
      "3. Reuse the template's custom commands (\\resumeSubheading, \\resumeItem, \\resumeItemListStart/End, \\resumeSubHeadingListStart/End, \\resumeProjectHeading) for every entry — never hand-roll itemize/tabular blocks.",
      "4. Populate every section (Professional Summary, Technical Skills, Experience, Projects, Education, Achievements, Certifications) from the candidate's actual content. Omit a section only if the candidate truly has nothing for it.",
      "5. Preserve every job, project, degree, achievement, and certification. Do NOT invent facts, dates, or metrics — if a field is missing, drop it rather than fabricate.",
      "6. Escape LaTeX-special characters in prose: % & _ # $ { } ~ ^ \\ — e.g. write 90\\% not 90%.",
      "7. Bold important keywords (metrics, tools, technologies) inside bullets using \\textbf{...}, matching the template's style.",
      "8. In the centered header, keep the icon commands (\\faMobile, \\faAt, \\faLinkedinSquare, \\faGithub, \\faGlobe, \\faMapMarker) and replace the placeholder values with the candidate's real contact info. Drop an icon line entirely if that info is not in the resume.",
      "9. Do not include Kunal / Worley / VIT or any other names from the template — those are placeholders only.",
    ].join("\n");

    const userMsg =
      "=== TEMPLATE (structure to follow exactly) ===\n" +
      RESUME_TEMPLATE_TEX +
      "\n\n=== CANDIDATE RESUME TEXT (extracted from PDF) ===\n" +
      data.text +
      "\n\nReturn the final LaTeX document now.";

    const url = `${(provider.base_url as string).replace(/\/$/, "")}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model.name,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Provider HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    const json: any = await res.json();
    let content: string = json.choices?.[0]?.message?.content ?? "";
    // Strip ``` fences if the model added them
    content = content.replace(/^\s*```(?:latex|tex)?\s*/i, "").replace(/```\s*$/, "").trim();
    // Trim anything before \documentclass and after \end{document}
    const startIdx = content.indexOf("\\documentclass");
    const endMarker = "\\end{document}";
    const endIdx = content.lastIndexOf(endMarker);
    if (startIdx >= 0 && endIdx > startIdx) {
      content = content.slice(startIdx, endIdx + endMarker.length);
    }
    if (!content.includes("\\documentclass") || !content.includes("\\end{document}")) {
      throw new Error("Model did not return a complete LaTeX document. Try again or paste your resume text manually.");
    }

    const inTok: number = json.usage?.prompt_tokens ?? 0;
    const outTok: number = json.usage?.completion_tokens ?? 0;
    const inCost = (inTok / 1_000_000) * Number(model.input_price_per_1m);
    const outCost = (outTok / 1_000_000) * Number(model.output_price_per_1m);
    const totalCost = inCost + outCost;

    await supabaseAdmin.from("ai_cost_logs").insert({
      workspace_id: wsId, user_id: context.userId,
      model_id: model.id, model_name: model.display_name,
      input_tokens: inTok, output_tokens: outTok, total_tokens: inTok + outTok,
      input_cost: inCost, output_cost: outCost, total_cost: totalCost,
      purpose: "custom",
    });

    return { latex: content, cost: totalCost, model: model.display_name };
  });