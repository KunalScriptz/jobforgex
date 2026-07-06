import * as yaml from "js-yaml";

import scorer from "@/config/prompts/resume_scorer.yaml?raw";
import tailor from "@/config/prompts/tailor_resume.yaml?raw";
import cover from "@/config/prompts/generate_cover_letter.yaml?raw";
import parse from "@/config/prompts/parse_jd.yaml?raw";
import ats from "@/config/prompts/ats_checker.yaml?raw";
import insights from "@/config/prompts/extract_insights.yaml?raw";
import builderSeed from "@/config/prompts/builder_seed.yaml?raw";
import builderJobMatch from "@/config/prompts/builder_job_match.yaml?raw";
import builderScore from "@/config/prompts/builder_score.yaml?raw";
import builderSuggestions from "@/config/prompts/builder_suggestions.yaml?raw";
import models from "@/config/models/deepseek_models.yaml?raw";

export type PromptDef = {
  system: string;
  user_template: string;
  temperature?: number;
  response_format?: "json_object";
};

const RAW: Record<string, string> = {
  resume_scorer: scorer,
  tailor_resume: tailor,
  generate_cover_letter: cover,
  parse_jd: parse,
  ats_checker: ats,
  extract_insights: insights,
  builder_seed: builderSeed,
  builder_job_match: builderJobMatch,
  builder_score: builderScore,
  builder_suggestions: builderSuggestions,
};

export function getPrompt(name: keyof typeof RAW): PromptDef {
  return yaml.load(RAW[name]) as PromptDef;
}

export function renderPrompt(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}

export type SeedModel = {
  name: string;
  display_name: string;
  input_price_per_1m: number;
  output_price_per_1m: number;
  is_default: boolean;
};

export function getSeedModels(): SeedModel[] {
  const parsed = yaml.load(models) as { models: SeedModel[] };
  return parsed.models;
}