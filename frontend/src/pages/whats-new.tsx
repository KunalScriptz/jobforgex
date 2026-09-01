import { useState } from "react";
import { ChevronDown, Sparkles, Wrench, CircleCheck, Megaphone } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { cn } from "@/lib/utils";

type EntryType = "feature" | "improvement" | "fix";

interface Entry {
  date: string; // e.g. "Sep 1"
  type: EntryType;
  title: string;
  description?: string;
}

interface Month {
  id: string;
  label: string;
  dot: string; // accent dot color
  border: string;
  entries: Entry[];
}

const TYPE_META: Record<EntryType, { label: string; badge: string; icon: React.ReactNode }> = {
  feature: {
    label: "New",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    icon: <Sparkles className="h-3 w-3" />,
  },
  improvement: {
    label: "Improved",
    badge: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    icon: <Wrench className="h-3 w-3" />,
  },
  fix: {
    label: "Fixed",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    icon: <CircleCheck className="h-3 w-3" />,
  },
};

const MONTHS: Month[] = [
  {
    id: "2026-09",
    label: "September 2026",
    dot: "bg-emerald-500",
    border: "border-emerald-500/40",
    entries: [
      {
        date: "Sep 1",
        type: "feature",
        title: "ATS score after tailoring",
        description: "Every tailored resume now gets an ATS score automatically: matched vs missing keywords, format checks, and suggestions to raise it.",
      },
      {
        date: "Sep 1",
        type: "feature",
        title: "Export jobs to Excel",
        description: "Download your whole pipeline as a styled .xlsx, including company, title, status, notes, scores and more, with borders and a frozen header.",
      },
      {
        date: "Sep 1",
        type: "feature",
        title: "Overleaf-style resume editor",
        description: "A file outline of every section that jumps the editor, plus a live PDF preview side-by-side.",
      },
      {
        date: "Sep 1",
        type: "feature",
        title: "Ask AI to edit your resume",
        description: "Ask the AI to add, remove, or rewrite content directly from the Resume page or any job document.",
      },
      {
        date: "Sep 1",
        type: "improvement",
        title: "AI remembers your profile",
        description: "Your name, location, and salary are now passed to the AI on every request as stable context.",
      },
      {
        date: "Sep 1",
        type: "fix",
        title: "Resumes stay within 2 pages",
        description: "Tailored resumes and AI edits are compiled and auto-shortened so they never overflow past 2 pages.",
      },
      {
        date: "Sep 1",
        type: "fix",
        title: "Stable scores",
        description: "Re-scoring a resume now returns a consistent score instead of changing each time.",
      },
    ],
  },
  {
    id: "2026-08",
    label: "August 2026",
    dot: "bg-sky-500",
    border: "border-sky-500/40",
    entries: [
      {
        date: "Aug 31",
        type: "fix",
        title: "Dark mode persists",
        description: "Your theme preference now sticks across page reloads.",
      },
      {
        date: "Aug 30",
        type: "feature",
        title: "Salary & location on your profile",
        description: "Collect salary and location during onboarding and use them across the app and Ask AI.",
      },
      {
        date: "Aug 29",
        type: "improvement",
        title: "Company context from the web",
        description: "Job details now pull a real company description from their website, with a Wikipedia fallback.",
      },
    ],
  },
];

export default function WhatsNewPage() {
  const [open, setOpen] = useState<Set<string>>(() => new Set([MONTHS[0].id]));

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <PageTitle title="What's New" />
      <div className="mb-6 flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">What's New</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        New features, improvements, and fixes, grouped by month. Click a month to expand it.
      </p>

      <div className="space-y-4">
        {MONTHS.map((month) => {
          const expanded = open.has(month.id);
          return (
            <div key={month.id} className={cn("rounded-xl border bg-card", expanded && month.border)}>
              <button
                onClick={() => toggle(month.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className={cn("h-3 w-3 shrink-0 rounded-full", month.dot)} />
                <span className="flex-1 text-sm font-semibold">{month.label}</span>
                <span className="text-xs text-muted-foreground">{month.entries.length} updates</span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
              </button>

              {expanded && (
                <div className="border-t px-4 py-3">
                  <div className="space-y-3">
                    {month.entries.map((entry, i) => {
                      const meta = TYPE_META[entry.type];
                      return (
                        <div key={i} className="flex gap-3">
                          <div className="w-14 shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">{entry.date}</div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.badge)}>
                                {meta.icon}{meta.label}
                              </span>
                              <span className="text-sm font-medium">{entry.title}</span>
                            </div>
                            {entry.description && (
                              <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
