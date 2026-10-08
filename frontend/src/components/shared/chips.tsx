import { CalendarClock, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusMeta, LIVE_STATUSES } from "@/lib/job-status";
import { sourceLabel } from "@/lib/sources";
import { ageInDays, daysUntil } from "@/lib/format";

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-4";

/** Resume-to-job fit, 0-100. Green from 75, amber from 50. */
export function ScoreBadge({ score, className }: { score: number | null | undefined; className?: string }) {
  if (score === null || score === undefined) return null;
  const tone =
    score >= 75 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : score >= 50 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
    : "bg-rose-500/10 text-rose-600 dark:text-rose-400";
  return <span className={cn(pill, tone, className)} title="Fit of your base resume to this job">Fit {score}</span>;
}

export function StageChip({ status, className }: { status: string; className?: string }) {
  const m = statusMeta(status);
  return <span className={cn(pill, m.chip, className)}>{m.label}</span>;
}

export function SourceBadge({ source, className }: { source: string | null | undefined; className?: string }) {
  return <span className={cn(pill, "bg-muted text-muted-foreground", className)}>{sourceLabel(source)}</span>;
}

/** "Follow up today" / "Overdue 3d" / "In 4d". Only meaningful while the application is live. */
export function FollowUpChip({ date, status, className }: { date: string | null | undefined; status?: string; className?: string }) {
  if (!date || (status && !LIVE_STATUSES.includes(status as any))) return null;
  const d = daysUntil(date);
  if (d === null) return null;
  const overdue = d < 0;
  const due = d <= 0;
  const text = d === 0 ? "Follow up today" : overdue ? `Overdue ${-d}d` : `Follow up in ${d}d`;
  return (
    <span
      className={cn(pill, due ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground", className)}
      title={`Follow-up date ${date}`}
    >
      <CalendarClock className="h-3 w-3" />{text}
    </span>
  );
}

/** How long ago something happened, e.g. "5d". */
export function AgeChip({ since, label, className }: { since: string | null | undefined; label?: string; className?: string }) {
  const d = ageInDays(since);
  if (d === null) return null;
  return (
    <span className={cn(pill, "bg-muted text-muted-foreground", className)} title={since ?? undefined}>
      <Clock className="h-3 w-3" />{label ? `${label} ` : ""}{d === 0 ? "today" : `${d}d`}
    </span>
  );
}
