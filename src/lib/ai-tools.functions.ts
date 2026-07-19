import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Tool catalog (shared with the client via a plain export) ----------

export type ToolStage = "application" | "interview" | "offer" | "insight";

export type ToolDef = {
  id: string;
  stage: ToolStage;
  label: string;
  short: string;
  accent: string; // tailwind color e.g. "indigo"
  contextLabel?: string;
  contextPlaceholder?: string;
  contextChips?: string[];
  system: string;
  buildUser: (v: {
    jd: string; company: string; title: string;
    resume_latex: string; context: string;
  }) => string;
};

const RESUME_FOOTER = (resume: string) =>
  resume ? `\n\n=== CANDIDATE RESUME (LaTeX, for factual grounding only) ===\n${resume}` : "";

const JD_BLOCK = (jd: string) =>
  jd ? `\n\n=== JOB DESCRIPTION ===\n${jd}` : "";

const CTX_BLOCK = (c: string, header: string) =>
  c ? `\n\n=== ${header} ===\n${c}` : "";

export const AI_TOOLS: ToolDef[] = [
  // --- Application stage
  {
    id: "cover_letter",
    stage: "application",
    label: "Cover Letter",
    short: "Personalized letter aligning your background to the role.",
    accent: "indigo",
    contextLabel: "Extra context (optional)",
    contextPlaceholder: "Anything specific to highlight (a project, referral, why this company)...",
    system: "You are a senior cover-letter writer. Return plain text (no markdown). Warm, confident, no cliches, ~300 words, no em-dashes as connectors.",
    buildUser: (v) =>
      `Write a one-page cover letter to the hiring team at ${v.company} for the ${v.title} role. Reference 2-3 specific requirements from the JD and connect them to concrete resume experience. Include subject line and greeting.`
      + JD_BLOCK(v.jd) + CTX_BLOCK(v.context, "EXTRA CONTEXT") + RESUME_FOOTER(v.resume_latex),
  },
  {
    id: "follow_up_app",
    stage: "application",
    label: "Follow Up After Application",
    short: "Polite check-in when there's been no response.",
    accent: "emerald",
    contextLabel: "Extra context (optional)",
    contextPlaceholder: "How long has it been? Any prior contact?",
    system: "You are an executive communication coach. Return plain text email (Subject + body). Short, warm, professional. No hard-sell.",
    buildUser: (v) =>
      `Write a follow-up email to the ${v.company} hiring team about the ${v.title} application. Politely reaffirm interest, invite next steps, keep under 130 words.`
      + CTX_BLOCK(v.context, "EXTRA CONTEXT") + JD_BLOCK(v.jd),
  },

  // --- Interview stage
  {
    id: "interview_prep",
    stage: "interview",
    label: "Interview Prep Questions",
    short: "Likely questions with talking points grounded in your resume.",
    accent: "violet",
    contextLabel: "Round type (optional)",
    contextChips: ["Recruiter Screen", "Hiring Manager", "Technical", "System Design", "Behavioral", "Final / Onsite"],
    system: "You output a clean markdown study sheet. Group by category. For each question include a 2-3 line talking point rooted in the candidate's resume when possible.",
    buildUser: (v) =>
      `Generate 10 likely interview questions for a ${v.title} at ${v.company}${v.context ? ` (round: ${v.context})` : ""}. Include 3 behavioral, 4 role-specific, 2 company/culture, 1 salary/logistics. Provide talking points per question.`
      + JD_BLOCK(v.jd) + RESUME_FOOTER(v.resume_latex),
  },
  {
    id: "questions_to_ask",
    stage: "interview",
    label: "Questions to Ask",
    short: "Sharp, curious questions to ask the interviewer.",
    accent: "sky",
    contextLabel: "Interviewer role (optional)",
    contextChips: ["Recruiter", "Hiring Manager", "Peer Engineer", "Skip-level", "Cross-functional partner"],
    system: "Output a bulleted list of 8 concise questions. Group by 'Role & team', 'Tech & process', 'Growth & culture'. No fluff.",
    buildUser: (v) =>
      `Suggest 8 insightful questions I could ask ${v.context ? `a ${v.context}` : "an interviewer"} for the ${v.title} role at ${v.company}. Tailor to the JD.`
      + JD_BLOCK(v.jd),
  },
  {
    id: "thank_you",
    stage: "interview",
    label: "Thank You After Interview",
    short: "Short, personal thank-you email.",
    accent: "amber",
    contextLabel: "What did you discuss? (optional)",
    contextPlaceholder: "One thing the interviewer said that stuck with you, project discussed, etc.",
    system: "Return plain text email (Subject + body). Warm, specific, under 140 words.",
    buildUser: (v) =>
      `Write a thank-you email after interviewing for ${v.title} at ${v.company}. Reference specific discussion. Reaffirm interest.`
      + CTX_BLOCK(v.context, "DISCUSSION NOTES"),
  },
  {
    id: "follow_up_interview",
    stage: "interview",
    label: "Follow Up After Interview",
    short: "Polite nudge when you haven't heard back.",
    accent: "emerald",
    contextLabel: "Days since interview (optional)",
    system: "Plain text email. Short, professional, no pressure.",
    buildUser: (v) =>
      `Write a follow-up email after interviewing for ${v.title} at ${v.company}. Politely check in on timeline, reaffirm interest, offer to answer more questions.`
      + CTX_BLOCK(v.context, "CONTEXT"),
  },
  {
    id: "reschedule",
    stage: "interview",
    label: "Reschedule Interview",
    short: "Request to move the interview time.",
    accent: "orange",
    contextLabel: "Reason (optional)",
    contextChips: ["Personal Emergency", "Scheduling Conflict", "Health Issues", "Family Emergency", "Work Commitment"],
    system: "Plain text email. Apologetic but confident, propose alternates.",
    buildUser: (v) =>
      `Write an email requesting to reschedule an interview for ${v.title} at ${v.company}. Reason (do not overshare): ${v.context || "unavoidable conflict"}. Propose 3 alternative windows within the next 5 business days.`,
  },
  {
    id: "decline_interview",
    stage: "interview",
    label: "Decline Interview",
    short: "Gracious decline that keeps the door open.",
    accent: "rose",
    contextLabel: "Reason (optional)",
    contextChips: ["Accepted Another Offer", "Scheduling Conflict", "Personal Reasons", "Location and Commute", "Not Interested in the Role"],
    system: "Plain text email. Gracious, brief, keep the relationship warm.",
    buildUser: (v) =>
      `Write an email declining an interview for ${v.title} at ${v.company}. Reason: ${v.context || "personal circumstances"}. Thank them and keep the door open for future roles.`,
  },

  // --- Offer stage
  {
    id: "offer_negotiation",
    stage: "offer",
    label: "Offer Negotiation",
    short: "Negotiate salary, equity, or benefits.",
    accent: "fuchsia",
    contextLabel: "Negotiation elements",
    contextChips: ["Base Salary", "Sign-On Bonus", "Equity or Stock Options", "Performance Bonus",
      "Flexible Working Arrangements", "Vacation Time and Paid Time Off", "Professional Development",
      "Health Insurance and Benefits", "Retirement Benefits", "Relocation Assistance", "Work Equipment and Home Office Setup"],
    system: "Plain text email. Grateful, collaborative tone; anchor asks with reasoning; avoid ultimatums.",
    buildUser: (v) =>
      `Write a negotiation email in response to the ${v.title} offer from ${v.company}. Address: ${v.context || "base salary"}. Justify with market data, scope, and my background. Ask for a specific range, not a single number.`
      + RESUME_FOOTER(v.resume_latex),
  },
  {
    id: "offer_acceptance",
    stage: "offer",
    label: "Offer Acceptance",
    short: "Enthusiastic, formal acceptance email.",
    accent: "emerald",
    contextLabel: "Anything to confirm? (optional)",
    contextPlaceholder: "Start date, remote arrangement, sign-on details you want to restate…",
    system: "Plain text email (Subject + body). Warm, formal, restate agreed terms.",
    buildUser: (v) =>
      `Write an acceptance email for the ${v.title} offer at ${v.company}. Restate excitement, confirm start date if provided, ask about next steps and any documents.`
      + CTX_BLOCK(v.context, "CONFIRMATIONS"),
  },
  {
    id: "offer_decline",
    stage: "offer",
    label: "Offer Decline",
    short: "Decline while preserving the relationship.",
    accent: "rose",
    contextLabel: "Reason (optional)",
    contextChips: ["Compensation and Benefits", "Better Offer Elsewhere", "Cultural Fit",
      "Career Goals and Growth Opportunities", "Work-Life Balance", "Location and Commute", "Personal Reasons"],
    system: "Plain text email. Warm, brief, don't burn bridges.",
    buildUser: (v) =>
      `Write an email declining the ${v.title} offer at ${v.company}. Reason (kept diplomatic): ${v.context || "personal circumstances"}. Thank them sincerely.`,
  },
  {
    id: "offer_time_extension",
    stage: "offer",
    label: "Offer Time Extension",
    short: "Ask for more time to decide.",
    accent: "amber",
    contextLabel: "Reason (optional)",
    contextChips: ["Evaluating Multiple Offers", "Personal Circumstances", "Consulting with Family",
      "Relocation Considerations", "Educational Commitments"],
    system: "Plain text email. Grateful, clear ask for a specific extra window.",
    buildUser: (v) =>
      `Write an email requesting a decision extension on the ${v.title} offer at ${v.company}. Reason: ${v.context || "need time for due diligence"}. Ask for 5–7 additional business days and reiterate strong interest.`,
  },
];

// Compact client-safe catalog (no functions) - the runAiTool call carries the id.
export const AI_TOOLS_META = AI_TOOLS.map(({ id, stage, label, short, accent, contextLabel, contextPlaceholder, contextChips }) => ({
  id, stage, label, short, accent, contextLabel, contextPlaceholder, contextChips,
}));

// ---------- Server function ----------

async function wsId(supabase: any, userId: string) {
  const { data } = await supabase.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
  if (!data) throw new Error("Workspace not found");
  return data.id as string;
}

export const runAiTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    job_id: z.string().uuid(),
    tool_id: z.string().min(1).max(80),
    context: z.string().max(4000).optional().default(""),
    model_id: z.string().uuid().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context: ctx }) => {
    const wsid = await wsId(ctx.supabase, ctx.userId);
    const tool = AI_TOOLS.find((t) => t.id === data.tool_id);
    if (!tool) throw new Error(`Unknown tool: ${data.tool_id}`);

    const { data: job } = await ctx.supabase.from("jobs").select("*").eq("id", data.job_id).maybeSingle();
    if (!job) throw new Error("Job not found");

    const { data: resume } = await ctx.supabase.from("resumes").select("*").eq("workspace_id", wsid).eq("is_base", true).maybeSingle();

    // AI tools are server-managed now. New users should not need workspace model settings.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const apiKey = (process.env.DEEPSEEK_API_KEY ?? "").trim();
    if (!apiKey) throw new Error("Server AI key not configured. Contact support.");
    const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/$/, "");
    const modelName = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
    const displayName = "DeepSeek Chat";
    const inputPricePer1M = Number(process.env.DEEPSEEK_INPUT_PRICE_PER_1M ?? "0.14");
    const outputPricePer1M = Number(process.env.DEEPSEEK_OUTPUT_PRICE_PER_1M ?? "0.28");

    const userMsg = tool.buildUser({
      jd: job.description ?? "",
      company: job.company,
      title: job.title,
      resume_latex: resume?.latex_source ?? "",
      context: data.context ?? "",
    });

    const url = `${baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelName,
        temperature: 0.55,
        max_tokens: 8192,
        messages: [
          { role: "system", content: tool.system },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Provider HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    const json: any = await res.json();
    const content: string = json.choices?.[0]?.message?.content ?? "";
    const inTok: number = json.usage?.prompt_tokens ?? 0;
    const outTok: number = json.usage?.completion_tokens ?? 0;
    const inCost = (inTok / 1_000_000) * inputPricePer1M;
    const outCost = (outTok / 1_000_000) * outputPricePer1M;
    const totalCost = inCost + outCost;

    await supabaseAdmin.from("ai_cost_logs").insert({
      workspace_id: wsid, user_id: ctx.userId, job_id: data.job_id,
      model_id: null, model_name: displayName,
      input_tokens: inTok, output_tokens: outTok, total_tokens: inTok + outTok,
      input_cost: inCost, output_cost: outCost, total_cost: totalCost,
      purpose: "custom",
    });

    return { content, tool_id: tool.id, tool_label: tool.label, cost: totalCost, model: displayName };
  });

export const saveToolOutput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    job_id: z.string().uuid(),
    tool_label: z.string().min(1).max(120),
    content: z.string().min(1).max(200_000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const wsid = await wsId(context.supabase, context.userId);
    // Look up the job so we can build a meaningful filename with company + title.
    const { data: job } = await context.supabase
      .from("jobs").select("company,title").eq("id", data.job_id).maybeSingle();
    const slug = (s: string) =>
      s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
    const parts = [
      slug(data.tool_label),
      job?.company ? slug(job.company) : "",
      job?.title ? slug(job.title) : "",
    ].filter(Boolean);
    const filename = `${parts.join("__")}.txt`;
    const { data: a, error } = await context.supabase.from("job_artifacts").insert({
      workspace_id: wsid, job_id: data.job_id, kind: "ai_tool" as any,
      filename, latex_source: data.content,
    }).select().single();
    if (error) throw new Error(error.message);
    return a;
  });