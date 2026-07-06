import { decryptApiKey } from "./crypto.server";
import { getPrompt, renderPrompt, type PromptDef } from "./prompts.server";

type CallArgs = {
  supabase: any; // authenticated supabase client (RLS)
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
  const { supabase, admin, workspaceId, userId, modelId, purpose, jobId, promptName, vars, overrideTemperature } = args;

  // Resolve model
  let model: any = null;
  if (modelId) {
    const { data } = await supabase.from("ai_models").select("*").eq("id", modelId).eq("workspace_id", workspaceId).maybeSingle();
    model = data;
  }
  if (!model) {
    const { data } = await supabase.from("ai_models").select("*").eq("workspace_id", workspaceId).eq("is_default", true).maybeSingle();
    model = data;
  }
  if (!model) {
    const { data } = await supabase.from("ai_models").select("*").eq("workspace_id", workspaceId).order("created_at").limit(1).maybeSingle();
    model = data;
  }
  if (!model) throw new Error("No AI model configured for this workspace");

  // Resolve provider (with encrypted key)
  const { data: provider } = await admin
    .from("ai_providers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!provider || !provider.api_key_encrypted) throw new Error("AI provider not configured");

  let apiKey: string;
  try {
    apiKey = decryptApiKey(provider.api_key_encrypted as string).trim();
  } catch (e: any) {
    throw new Error(
      `Could not decrypt saved API key (${e?.message ?? "unknown"}). ` +
      `The encryption secret may have changed — re-enter your API key in Settings.`,
    );
  }

  const prompt: PromptDef = getPrompt(promptName as any);
  const body: any = {
    model: model.name,
    temperature: overrideTemperature ?? prompt.temperature ?? 0.3,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: renderPrompt(prompt.user_template, vars) },
    ],
  };
  if (prompt.response_format === "json_object") body.response_format = { type: "json_object" };

  const base = (provider.base_url as string).replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const masked = apiKey.length > 8 ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : "****";
  console.log(`[callDeepseek] POST ${url} model=${model.name} purpose=${purpose} key=${masked}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.log(`[callDeepseek] ← ${res.status} ${text.slice(0, 500)}`);
    throw new Error(
      `Provider returned HTTP ${res.status} ${res.statusText}\n` +
      `URL: ${url}\nModel: ${model.name}\nKey: ${masked} (len ${apiKey.length})\n\n` +
      `Body:\n${text.slice(0, 1200)}`,
    );
  }
  const json: any = await res.json();
  const content: string = json.choices?.[0]?.message?.content ?? "";
  const inTok: number = json.usage?.prompt_tokens ?? 0;
  const outTok: number = json.usage?.completion_tokens ?? 0;

  const inCost = (inTok / 1_000_000) * Number(model.input_price_per_1m);
  const outCost = (outTok / 1_000_000) * Number(model.output_price_per_1m);
  const totalCost = inCost + outCost;

  await admin.from("ai_cost_logs").insert({
    workspace_id: workspaceId,
    user_id: userId,
    job_id: jobId ?? null,
    model_id: model.id,
    model_name: model.display_name,
    input_tokens: inTok,
    output_tokens: outTok,
    total_tokens: inTok + outTok,
    input_cost: inCost,
    output_cost: outCost,
    total_cost: totalCost,
    purpose,
  });

  return { content, inputTokens: inTok, outputTokens: outTok, totalCost, modelName: model.display_name };
}

// A simple direct ping used by "test connection"
export async function pingDeepseek(baseUrl: string, apiKey: string, modelName: string): Promise<void> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Test failed (${res.status}): ${t.slice(0, 300)}`);
  }
}