import { Link } from "react-router-dom";
import { CheckCircle2, Circle } from "lucide-react";

import { useSetup } from "@/hooks/use-overview";
import { PageTitle } from "@/components/page-title";
import { PageHeader } from "@/components/shared/page-header";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const COPY: Record<string, { title: string; body: string; cta: string }> = {
  profile: {
    title: "Complete your profile",
    body: "Your name and location go on every resume and cover letter.",
    cta: "Open profile",
  },
  resume: {
    title: "Add your base resume",
    body: "Everything gets tailored from this one document. Paste your LaTeX or import a PDF.",
    cta: "Open resumes",
  },
  extension: {
    title: "Connect the Chrome extension",
    body: "Save jobs from LinkedIn, Indeed, JobStreet and company career pages in one click.",
    cta: "Get your token",
  },
  first_job: {
    title: "Save your first job",
    body: "Use the extension on a job posting, or add one by hand.",
    cta: "Open Discovery",
  },
  first_application: {
    title: "Track your first application",
    body: "Mark a saved job as applied and it joins the Tracker board.",
    cta: "Open Tracker",
  },
  weekly_target: {
    title: "Set your weekly target",
    body: "Pick how many applications a week you're aiming for. The Overview tracks your pace.",
    cta: "Set target",
  },
};

export default function SetupPage() {
  const { data, isLoading } = useSetup();
  return (
    <div className="mx-auto max-w-2xl p-6">
      <PageTitle title="Setup quest" />
      <PageHeader title="Setup quest" description="A few steps to get JobForge working for you." />
      {isLoading || !data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="mb-5 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{data.done === data.total ? "All set!" : "Your progress"}</span>
              <span className="tabular-nums text-muted-foreground">{data.done} of {data.total}</span>
            </div>
            <Progress value={(data.done / data.total) * 100} className="mt-2 h-2" />
          </div>
          <ol className="space-y-2">
            {data.items.map((item) => {
              const copy = COPY[item.key] ?? { title: item.key, body: "", cta: "Open" };
              return (
                <li key={item.key} className={cn("flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm", item.done && "opacity-70")}>
                  {item.done
                    ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/50" />}
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm font-medium", item.done && "line-through")}>{copy.title}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{copy.body}</p>
                  </div>
                  {!item.done && (
                    <Link to={item.href} className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline">{copy.cta} →</Link>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
