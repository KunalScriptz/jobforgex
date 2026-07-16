import { getPrompt, renderPrompt, type PromptDef } from "./prompts.server";

type CallArgs = {
  supabase?: any;
  admin: any;    // service-role client (for logging)
  workspaceId: string;
  userId: string;
  modelId?: string | null;
  purpose:
    | "resume_tailoring" | "cover_letter" | "resume_scoring"
    | "jd_parsing" | "ats_check" | "custom"
    | "builder_seed" | "builder_job_match" | "builder_score" | "builder_suggestions";
  jobId?: string | null;
  promptName: keyof ReturnType<typeof allPromptKeys>;
  vars: Record<string, string | number>;
  overrideTemperature?: number;
};

// Trick to expose the union of prompt names as a type
function allPromptKeys() {
  return {
    resume_scorer: 0,
    tailor_resume: 0,
    generate_cover_letter: 0,
    parse_jd: 0,
    ats_checker: 0,
    extract_insights: 0,
    builder_seed: 0,
    builder_job_match: 0,
    builder_score: 0,
    builder_suggestions: 0,
  };
}

export type CallResult = {
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  modelName: string;
};

export async function callDeepseek(args: CallArgs): Promise<CallResult> {
  const { admin, workspaceId, userId, purpose, jobId, promptName, vars, overrideTemperature } = args;

  const apiKey = (process.env.DEEPSEEK_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("Server AI key not configured. Contact support.");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/$/, "");
  const modelName = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  const displayName = "DeepSeek Chat";
  const inputPricePer1M = Number(process.env.DEEPSEEK_INPUT_PRICE_PER_1M ?? "0.14");
  const outputPricePer1M = Number(process.env.DEEPSEEK_OUTPUT_PRICE_PER_1M ?? "0.28");

  const prompt: PromptDef = getPrompt(promptName as any);
  const body: any = {
    model: modelName,
    temperature: overrideTemperature ?? prompt.temperature ?? 0.3,
    max_tokens: 8192,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: renderPrompt(prompt.user_template, vars) },
    ],
  };
  if (prompt.response_format === "json_object") body.response_format = { type: "json_object" };

  const url = `${baseUrl}/chat/completions`;
  const masked = apiKey.length > 8 ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : "****";
  console.log(`[callDeepseek] POST ${url} model=${modelName} purpose=${purpose} key=${masked}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.log(`[callDeepseek] ← ${res.status} ${text.slice(0, 500)}`);
    throw new Error(`AI provider error ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const content: string = json.choices?.[0]?.message?.content ?? "";
  const inTok: number = json.usage?.prompt_tokens ?? 0;
  const outTok: number = json.usage?.completion_tokens ?? 0;

  const inCost = (inTok / 1_000_000) * inputPricePer1M;
  const outCost = (outTok / 1_000_000) * outputPricePer1M;
  const totalCost = inCost + outCost;

  await admin.from("ai_cost_logs").insert({
    workspace_id: workspaceId,
    user_id: userId,
    job_id: jobId ?? null,
    model_id: null,
    model_name: displayName,
    input_tokens: inTok,
    output_tokens: outTok,
    total_tokens: inTok + outTok,
    input_cost: inCost,
    output_cost: outCost,
    total_cost: totalCost,
    purpose,
  });

  return { content, inputTokens: inTok, outputTokens: outTok, totalCost, modelName: displayName };
}

// Ping helper kept for backward compatibility; not used by UI anymore.
export async function pingDeepseek(_baseUrl: string, _apiKey: string, _modelName: string): Promise<void> {
  return;
}