import { Link } from "react-router-dom";
import { ArrowRight, FileText, Layers, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/page-title";
import { cn } from "@/lib/utils";
import { rgbTupleToHex } from "@/lib/colors";
import { useJobs } from "@/hooks/use-jobs";
import { useBaseResume } from "@/hooks/use-resumes";

export default function BuilderIndexPage() {
  const { data: jobs, isLoading: jobsLoading } = useJobs();
  const { data: baseResume, isLoading: baseLoading } = useBaseResume();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <PageTitle title="Resume Builder" />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Resume Builder</h1>
        <p className="text-sm text-muted-foreground">
          Pick a job to build a tailored resume from your base LaTeX template. Every change is
          reflected live in the PDF and can be saved as your new base.
        </p>
      </header>

      {!baseLoading && (
        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {baseResume?.name ?? "No base resume"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {baseResume ? "Base template used to seed new builds" : "Create a base resume first"}
                </div>
              </div>
            </div>
            {baseResume && (
              <div className="flex items-center gap-1.5">
                <ColorSwatch color={rgbTupleToHex(baseResume.primary_color)} />
                <ColorSwatch color={rgbTupleToHex(baseResume.secondary_color)} />
              </div>
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Build from a job</h2>
        </div>

        {jobsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : jobs && jobs.length > 0 ? (
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex items-center justify-between gap-4 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {job.company || "Unknown company"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {job.title || "Untitled role"}
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/builder/${job.id}`}>
                    <PenLine className="h-3.5 w-3.5" />
                    Open
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No jobs yet. Add a job from the Jobs page, then come back here to build a tailored
            resume.
          </div>
        )}
      </section>
    </div>
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      className={cn("h-4 w-4 rounded-full border")}
      style={{ backgroundColor: color }}
    />
  );
}
