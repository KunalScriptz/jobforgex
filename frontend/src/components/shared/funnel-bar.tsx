import type { FunnelStage } from "@/api/overview";

/** Horizontal funnel: each bar is scaled to the biggest stage; the % is conversion from the stage before. */
export function FunnelBar({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ul className="space-y-3">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].count : null;
        const conv = prev ? Math.round((s.count / prev) * 100) : null;
        return (
          <li key={s.key} className="grid grid-cols-[7rem_1fr_6.5rem] items-center gap-3 text-sm">
            <span className="text-muted-foreground">{s.label}</span>
            <div className="h-6 overflow-hidden rounded-md bg-muted">
              <div
                className="h-full rounded-md bg-primary/80 transition-all"
                style={{ width: `${Math.max(s.count ? 2 : 0, (s.count / max) * 100)}%` }}
              />
            </div>
            <span className="text-right tabular-nums">
              <span className="font-semibold">{s.count}</span>
              {conv !== null && <span className="ml-1.5 text-xs text-muted-foreground">{conv}%</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
