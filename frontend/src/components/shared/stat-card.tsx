import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label, value, hint, icon: Icon, tone = "default", onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "good" | "warn" | "bad";
  onClick?: () => void;
}) {
  const toneClass = {
    default: "text-foreground",
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-rose-600 dark:text-rose-400",
  }[tone];
  const Wrapper: any = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-card p-4 text-left shadow-sm",
        onClick && "transition-colors hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {Icon && <Icon className="h-4 w-4" />}
      </div>
      <div className={cn("mt-2 text-3xl font-semibold tabular-nums", toneClass)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Wrapper>
  );
}
