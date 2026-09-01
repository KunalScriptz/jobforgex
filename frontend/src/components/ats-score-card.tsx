import { Loader2, Target, CheckCircle2, AlertTriangle } from "lucide-react";
import type { AtsScoreResult } from "@/api/ai";

export function AtsScoreCard({ result, loading }: { result: AtsScoreResult | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Scoring ATS compatibility…
      </div>
    );
  }
  if (!result) return null;

  const s = Math.max(0, Math.min(100, result.ats_score));
  const ring = s >= 75 ? "text-emerald-500" : s >= 50 ? "text-amber-500" : "text-red-500";

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-muted-foreground" /> ATS Score
          </div>
          <div className="text-xs text-muted-foreground">
            Keyword match {(result.keyword_match * 100).toFixed(0)}%
          </div>
        </div>
        <div className={`text-4xl font-bold ${ring}`}>
          {s}
          <span className="text-lg text-muted-foreground">/100</span>
        </div>
      </div>

      {result.summary && <p className="mt-2 text-xs text-muted-foreground">{result.summary}</p>}

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
