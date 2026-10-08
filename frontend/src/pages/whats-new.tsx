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
    id: "2026-10",
    label: "October 2026",
    dot: "bg-teal-500",
    border: "border-teal-500/40",
    entries: [
      {
        date: "Oct 8",
        type: "feature",
        title: "A new home: Overview, Today and Discovery",
        description: "Overview shows your funnel, weekly target and reply rate for each job board. Today lists the follow-ups due and the jobs ready to send. Discovery holds every job you've saved but not yet applied to. A navy sidebar groups it all, with a Setup quest to get you started.",
      },
      {
        date: "Oct 8",
        type: "feature",
        title: "Tracker with seven stages",
        description: "The board is now Applied, Acknowledged, Screening, Interviewing, Offer, Negotiating and Rejected, with fit scores, follow-up reminders and the job board on every card. Saved jobs live in Discovery until you mark them applied.",
      },
      {
        date: "Oct 8",
        type: "feature",
        title: "Follow-up reminders and weekly goals",
        description: "Set how many applications you want to send each week and how many days to wait before an unanswered one is flagged. The daily digest now includes replies and follow-ups due.",
      },
      {
        date: "Oct 8",
        type: "improvement",
        title: "No more duplicate saves",
        description: "Saving the same job twice (even from a different link to the same posting) now keeps one copy. The Chrome extension tells you when a job was already saved.",
      },
      {
        date: "Oct 5",
        type: "improvement",
        title: "Daily digest",
        description: "A morning (7 AM IST) and evening (6 PM IST) summary email, with a one-click unsubscribe and a switch in Settings. Use “Send me a test digest” to check it.",
      },
      {
        date: "Oct 5",
        type: "fix",
        title: "Your data is private to your workspace",
        description: "Job, document and resume endpoints now always check who is asking. Nobody else can read, change or delete your jobs and files.",
      },
    ],
  },
  {
    id: "2026-09",
    label: "September 2026",
    dot: "bg-emerald-500",
    border: "border-emerald-500/40",
    entries: [
      {
        date: "Sep 13",
        type: "feature",
        title: "Your name and avatar in Settings",
        description: "Add your full name and pick a professional avatar in Settings — it now shows in the sidebar and is used as your real name on generated resumes and cover letters instead of a guess.",
      },
      {
        date: "Sep 13",
        type: "feature",
        title: "Autofill profile fields",
        description: "Phone, LinkedIn, portfolio, current title, and current company can now be saved in Settings for the Chrome extension's autofill feature.",
      },
      {
        date: "Sep 13",
        type: "feature",
        title: "Chrome extension: Workable support + autofill",
        description: "The extension now works on Workable job postings, scrapes more sites more reliably, and can autofill application forms (name, email, phone, location, links) from your JobForge profile with one click.",
      },
      {
        date: "Sep 13",
        type: "improvement",
        title: "Cleaner professional summaries",
        description: "Tailored resumes no longer repeat your city/country in the Professional Summary — it already appears in the header.",
      },
      {
        date: "Sep 13",
        type: "fix",
        title: "Occasional resume compile errors",
        description: "Fixed a rare issue where a cut-off AI response during resume tailoring could produce a broken PDF. Generation now detects and retries automatically.",
      },
      {
        date: "Sep 13",
        type: "fix",
        title: "Settings location field behaving oddly",
        description: "The Current Location field no longer pops its suggestion list open every time the page loads, and no longer asks you to re-pick a value you already saved.",
      },
      {
        date: "Sep 13",
        type: "fix",
        title: "Stray text artifacts in generated documents",
        description: "Removed occasional leftover placeholder text (e.g. from pasted job descriptions) that could show up in a generated summary or letter.",
      },
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
        title: "Stable scores",
        description: "Re-scoring a resume now returns a consistent score instead of changing each time.",
      },
      {
        date: "Sep 1",
        type: "feature",
        title: "First-time guide and interactive tour",
        description: "A welcome guide now opens right after onboarding, plus a spotlight tour that walks you through every section in the sidebar.",
      },
      {
        date: "Sep 1",
        type: "improvement",
        title: "Search your city with country",
        description: "The current location field now suggests cities with their countries as you type, so Ask AI gets an accurate location.",
      },
      {
        date: "Sep 1",
        type: "improvement",
        title: "Install the extension from the Chrome Web Store",
        description: "Add JobForge Autofill in one click from the Chrome Web Store, no unzipping or developer mode.",
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
