import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callDeepseek } from "./deepseek.server";
import { extractResumeName } from "./filenames";
import { assertCanGenerate } from "./entitlement.server";

async function wsId(supabase: any, userId: string) {
  const { data } = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
  if (!data) throw new Error("Workspace not found");
  return data.id as string;
}

function stripFences(s: string) {
  return s.replace(/^```(?:latex|tex)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

/**
 * Some models emit `letter`/`moderncv`/`fontawesome` commands even when told
 * not to. Rewrite them into plain LaTeX so the document compiles with a bare
 * `article` class.
 */
function sanitizeCoverLetterLatex(src: string): string {
  let s = src;

  // Force article class + drop unsupported packages/classes.
  s = s.replace(/\\documentclass(\[[^\]]*\])?\{(letter|moderncv|europecv|cv|scrlttr2)\}/g,
    "\\documentclass[11pt]{article}\\usepackage[margin=1in]{geometry}\\usepackage{parskip}");
  s = s.replace(/\\usepackage(\[[^\]]*\])?\{(moderncv|fontawesome5?|marvosym|academicons|fontspec)\}/g, "");

  // letter-class commands → plain text.
  s = s.replace(/\\opening\{([^}]*)\}/g, "$1\n\n");
  s = s.replace(/\\closing\{([^}]*)\}/g, "$1");
  s = s.replace(/\\signature\{([^}]*)\}/g, "$1");
  s = s.replace(/\\(fromaddress|toaddress|address|fromname|fromphone|fromemail|name|title|phone|email|homepage|social|extrainfo|photo|quote|makelettertitle|makecvtitle|recomputelengths|makeletterclosing)\s*(\[[^\]]*\])?\s*\{[^}]*\}/g, "");
  s = s.replace(/\\(makelettertitle|makecvtitle|recomputelengths|makeletterclosing)\b/g, "");
  s = s.replace(/\\begin\{letter\}\s*\{[^}]*\}/g, "");
  s = s.replace(/\\end\{letter\}/g, "");

  // fontawesome icons → drop.
  s = s.replace(/\\fa[A-Za-z]+\*?\s*(\[[^\]]*\])?/g, "");

  return s;
}

function sanitizeFilenamePart(s: string) {
  return s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "unknown";
}

function buildDocFilename(opts: { name: string; company: string; title: string; suffix: string }) {
  const parts = [opts.name, opts.company, opts.title, opts.suffix]
    .map(sanitizeFilenamePart)
    .filter((s) => s && s !== "unknown");
  return parts.join("_") + ".tex";
}

export const scoreResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jd: string; resume_id?: string; model_id?: string | null; job_id?: string | null }) =>
    z.object({
      jd: z.string().min(30).max(100000),
      resume_id: z.string().uuid().optional(),
      model_id: z.string().uuid().optional().nullable(),
      job_id: z.string().uuid().optional().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let resume: any = null;
    if (data.resume_id) {
      const r = await context.supabase.from("resumes").select("*").eq("id", data.resume_id).maybeSingle();
      resume = r.data;
    } else {
      const r = await context.supabase.from("resumes").select("*").eq("workspace_id", id).eq("is_base", true).maybeSingle();
      resume = r.data;
    }
    if (!resume) throw new Error("No resume found. Complete onboarding first.");

    const result = await callDeepseek({
      supabase: context.supabase,
      admin: supabaseAdmin,
      workspaceId: id,
      userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "resume_scoring",
      jobId: data.job_id ?? null,
      promptName: "resume_scorer",
      vars: { jd: data.jd, resume_latex: resume.latex_source },
    });

    let parsed: any = null;
    try { parsed = JSON.parse(result.content); }
    catch {
      const m = result.content.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    if (!parsed) parsed = { score: 0, strengths: [], gaps: [], missing_keywords: [], missing_metrics: [], summary: "Could not parse model response." };
    return { report: parsed, cost: result.totalCost, model: result.modelName };
  });

export const tailorResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    jd: z.string().min(30).max(100000),
    company: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    model_id: z.string().uuid().optional().nullable(),
    job_id: z.string().uuid().optional().nullable(),
    resume_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let resume: any;
    if (data.resume_id) {
      resume = (await context.supabase.from("resumes").select("*").eq("id", data.resume_id).maybeSingle()).data;
    } else {
      resume = (await context.supabase.from("resumes").select("*").eq("workspace_id", id).eq("is_base", true).maybeSingle()).data;
    }
    if (!resume) throw new Error("No base resume found.");

    await assertCanGenerate(supabaseAdmin, id, data.job_id ?? null);

    const result = await callDeepseek({
      supabase: context.supabase,
      admin: supabaseAdmin,
      workspaceId: id, userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "resume_tailoring",
      jobId: data.job_id ?? null,
      promptName: "tailor_resume",
      vars: { jd: data.jd, resume_latex: resume.latex_source, page_count: resume.page_count ?? 1 },
    });

    const latex = stripFences(result.content);
    const name = extractResumeName(resume.latex_source ?? "");
    const filename = buildDocFilename({ name, company: data.company, title: data.title, suffix: "Resume" });
    return { latex, filename, cost: result.totalCost, model: result.modelName };
  });

export const generateCoverLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    jd: z.string().min(30).max(100000),
    company: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    model_id: z.string().uuid().optional().nullable(),
    job_id: z.string().uuid().optional().nullable(),
    resume_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let resume: any;
    if (data.resume_id) {
      resume = (await context.supabase.from("resumes").select("*").eq("id", data.resume_id).maybeSingle()).data;
    } else {
      resume = (await context.supabase.from("resumes").select("*").eq("workspace_id", id).eq("is_base", true).maybeSingle()).data;
    }
    if (!resume) throw new Error("No base resume found.");

    await assertCanGenerate(supabaseAdmin, id, data.job_id ?? null);

    const result = await callDeepseek({
      supabase: context.supabase, admin: supabaseAdmin,
      workspaceId: id, userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "cover_letter",
      jobId: data.job_id ?? null,
      promptName: "generate_cover_letter",
      vars: { jd: data.jd, resume_latex: resume.latex_source, company: data.company, title: data.title },
    });

    const latex = sanitizeCoverLetterLatex(stripFences(result.content));
    const name = extractResumeName(resume.latex_source ?? "");
    const filename = buildDocFilename({ name, company: data.company, title: data.title, suffix: "Cover_Letter" });
    return { latex, filename, cost: result.totalCost, model: result.modelName };
  });

export const saveArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    job_id: z.string().uuid(),
    kind: z.enum(["tailored_resume","cover_letter"]),
    filename: z.string().min(1).max(300),
    latex_source: z.string().min(10).max(500000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { data: a, error } = await context.supabase.from("job_artifacts").insert({
      workspace_id: id, job_id: data.job_id, kind: data.kind,
      filename: data.filename, latex_source: data.latex_source,
    }).select().single();
    if (error) throw new Error(error.message);
    return a;
  });

export const runAtsCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { resume_id?: string; model_id?: string | null }) =>
    z.object({ resume_id: z.string().uuid().optional(), model_id: z.string().uuid().optional().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let resume: any;
    if (data.resume_id) resume = (await context.supabase.from("resumes").select("*").eq("id", data.resume_id).maybeSingle()).data;
    else resume = (await context.supabase.from("resumes").select("*").eq("workspace_id", id).eq("is_base", true).maybeSingle()).data;
    if (!resume) throw new Error("No resume found.");

    const result = await callDeepseek({
      supabase: context.supabase, admin: supabaseAdmin,
      workspaceId: id, userId: context.userId,
      modelId: data.model_id ?? undefined,
      purpose: "ats_check", jobId: null,
      promptName: "ats_checker", vars: { resume_latex: resume.latex_source },
    });
    let parsed: any = null;
    try { parsed = JSON.parse(result.content); }
    catch { const m = result.content.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
    if (!parsed) parsed = { ats_score: 0, issues: [], recommendations: [] };
    return { report: parsed, cost: result.totalCost, model: result.modelName };
  });

/**
 * Ask a question about a generated resume artifact, OR request an edit
 * (e.g. "remove PyTorch bullets"). Returns { mode: "answer" | "modify",
 * answer, latex? }. When mode === "modify" the caller persists the new LaTeX
 * back onto the artifact and recompiles.
 */
export const chatWithArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    artifact_id: z.string().uuid(),
    question: z.string().min(1).max(4000),
    model_id: z.string().uuid().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const id = await wsId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: art } = await context.supabase
      .from("job_artifacts").select("*").eq("id", data.artifact_id).maybeSingle();
    if (!art) throw new Error("Artifact not found");
    if (!art.latex_source) throw new Error("Artifact has no LaTeX source.");

    let jd = "";
    if (art.job_id) {
      const { data: job } = await context.supabase
        .from("jobs").select("description").eq("id", art.job_id).maybeSingle();
      jd = job?.description ?? "";
    }

    const apiKey = (process.env.DEEPSEEK_API_KEY ?? "").trim();
    if (!apiKey) throw new Error("Server AI key not configured. Contact support.");
    const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/$/, "");
    const modelName = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
    const inputPricePer1M = Number(process.env.DEEPSEEK_INPUT_PRICE_PER_1M ?? "0.14");
    const outputPricePer1M = Number(process.env.DEEPSEEK_OUTPUT_PRICE_PER_1M ?? "0.28");

    const system = [
      "You help a candidate work with a LaTeX resume they've already tailored for a job.",
      "The user will ask a question about the resume OR ask you to modify it.",
      "Return ONLY a JSON object of the form:",
      '  {"mode":"answer","answer":"<markdown answer, may be multi-paragraph>"}',
      "  OR",
      '  {"mode":"modify","answer":"<1-2 sentence summary of what you changed>","latex":"<complete new LaTeX document>"}',
      "",
      "Rules for mode=answer: When the user asks an interview/application-style question",
      "(e.g. 'Share examples of internal tools you've built and their impact'),",
      "draft a strong first-person answer grounded ONLY in facts already in the resume/JD.",
      "Do NOT invent projects, metrics, employers, or dates.",
      "",
      "Rules for mode=modify: Preserve the document's structural template",
      "(packages, custom commands, colors). Do NOT change the page count.",
      "Return the COMPLETE LaTeX starting with \\documentclass and ending with \\end{document}.",
      "Never fabricate experience; only rewrite/remove/reorder existing content.",
    ].join("\n");

    const userMsg =
      (jd ? `=== JOB DESCRIPTION ===\n${jd}\n\n` : "") +
      `=== CURRENT RESUME (LaTeX) ===\n${art.latex_source}\n\n` +
      `=== USER REQUEST ===\n${data.question}`;

    const url = `${baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelName,
        temperature: 0.3,
        max_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI provider error ${res.status}: ${text.slice(0, 300)}`);
    }
    const json: any = await res.json();
    const content: string = json.choices?.[0]?.message?.content ?? "";
    let parsed: any = null;
    try { parsed = JSON.parse(content); }
    catch { const m = content.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
    if (!parsed || !parsed.mode) parsed = { mode: "answer", answer: content || "(no response)" };

    // Log cost
    const inTok: number = json.usage?.prompt_tokens ?? 0;
    const outTok: number = json.usage?.completion_tokens ?? 0;
    const inCost = (inTok / 1_000_000) * inputPricePer1M;
    const outCost = (outTok / 1_000_000) * outputPricePer1M;
    await supabaseAdmin.from("ai_cost_logs").insert({
      workspace_id: id, user_id: context.userId, job_id: art.job_id ?? null,
      model_id: null, model_name: "DeepSeek Chat",
      input_tokens: inTok, output_tokens: outTok, total_tokens: inTok + outTok,
      input_cost: inCost, output_cost: outCost, total_cost: inCost + outCost,
      purpose: "custom",
    });

    if (parsed.mode === "modify" && typeof parsed.latex === "string" && parsed.latex.includes("\\documentclass")) {
      const clean = stripFences(parsed.latex);
      await context.supabase.from("job_artifacts")
        .update({ latex_source: clean, pdf_storage_path: null, compile_error: null })
        .eq("id", art.id);
      return { mode: "modify", answer: parsed.answer ?? "Resume updated.", updated: true };
    }
    return { mode: "answer", answer: parsed.answer ?? "(no response)", updated: false };
  });