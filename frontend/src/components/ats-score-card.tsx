import { Loader2, Target, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import type { AtsScoreResult } from "@/api/ai";

function scoreColor(s: number, good: number, warn: number) {
  return s >= good ? "text-emerald-500" : s >= warn ? "text-amber-500" : "text-red-500";
}

export function AtsScoreCard({ result, loading }: { result: AtsScoreResult | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Scoring resume…
      </div>
    );
  }
  if (!result) return null;

  const base = Math.max(0, Math.min(100, result.base_score));
  const match = Math.max(0, Math.min(100, result.job_match_score));

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-muted-foreground" /> Resume Score
          </div>
          <div className={`mt-1 text-3xl font-bold ${scoreColor(base, 75, 50)}`}>
            {base}
            <span className="text-base text-muted-foreground">/100</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">Base resume quality</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-muted-foreground" /> Job Match
          </div>
          <div className={`mt-1 text-3xl font-bold ${scoreColor(match, 90, 70)}`}>
            {match}
            <span className="text-base text-muted-foreground">/100</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">Keyword coverage vs JD</div>
        </div>
      </div>

      {result.summary && <p className="mt-3 text-xs text-muted-foreground">{result.summary}</p>}

      <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Matched ({result.matched_keywords.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {result.matched_keywords.slice(0, 16).map((k, i) => (
              <span key={i} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">{k}</span>
            ))}
            {result.matched_keywords.length === 0 && <span className="text-muted-foreground">None found</span>}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> Missing ({result.missing_keywords.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {result.missing_keywords.slice(0, 16).map((k, i) => (
              <span key={i} className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">{k}</span>
            ))}
            {result.missing_keywords.length === 0 && <span className="text-muted-foreground">None</span>}
          </div>
        </div>
      </div>

      {result.suggestions.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium">Suggestions to improve</div>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {result.suggestions.slice(0, 5).map((sugg, i) => <li key={i}>{sugg}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
