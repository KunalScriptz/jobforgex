import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Compass, Pencil, Trash2, Wand2 } from "lucide-react";

import { jobsApi, type JobCard } from "@/api/jobs";
import { invalidateJobs, useJobCards } from "@/hooks/use-jobs";
import { useBoards } from "@/hooks/use-workspace";
import { JobDetailDialog } from "@/components/job-detail-dialog";
import { AddJobButton, JobFormDialog } from "@/components/job-form-dialog";
import { PageTitle } from "@/components/page-title";
import { PageHeader } from "@/components/shared/page-header";
import { JobRow } from "@/components/shared/job-row";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sourceLabel } from "@/lib/sources";

const PARAMS = { status: "wishlist", limit: 1000 };

/** Saved jobs: everything you've found but not applied to yet. Applying moves a job to the Tracker. */
export default function DiscoveryPage() {
  const qc = useQueryClient();
  const { data: boards = [] } = useBoards();
  const { data, isLoading } = useJobCards(PARAMS);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editJob, setEditJob] = useState<JobCard | null>(null);

  const jobs = data?.jobs ?? [];
  const sources = useMemo(() => Array.from(new Set(jobs.map((j) => j.source))).sort(), [jobs]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) =>
      (source === "all" || j.source === source) &&
      (!q || `${j.company} ${j.title} ${j.location ?? ""}`.toLowerCase().includes(q)),
    );
  }, [jobs, search, source]);

  const markApplied = useMutation({
    mutationFn: (id: string) => jobsApi.bulkUpdateStatus([id], "applied"),
    onSuccess: () => { toast.success("Marked as applied. Find it in the Tracker."); invalidateJobs(qc); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => jobsApi.deleteJob(id),
    onSuccess: () => { toast.success("Job removed"); invalidateJobs(qc); },
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageTitle title="Discovery" />
      <PageHeader
        title="Discovery"
        description="Jobs you've saved from the Chrome extension or added by hand. Tailor a resume, apply, then mark it applied."
        actions={<AddJobButton boards={boards} label="Add job" />}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Search saved jobs…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        {sources.length > 1 && (
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map((s) => <SelectItem key={s} value={s}>{sourceLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <span className="ml-auto self-center text-xs text-muted-foreground">{shown.length} of {jobs.length} saved</span>
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="Nothing saved yet"
          description="Install the Chrome extension and click “Save to JobForge” on any job posting, or add one manually."
          action={<div className="flex gap-2"><AddJobButton boards={boards} /><Button asChild size="sm" variant="outline"><Link to="/settings">Get the extension</Link></Button></div>}
        />
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No saved jobs match.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((j) => (
            <JobRow key={j.id} job={j} onOpen={setOpenId} actions={
              <>
                <Button asChild size="sm" variant="outline"><Link to={`/generate?job=${j.id}`}><Wand2 className="mr-1 h-3.5 w-3.5" />{j.tailored_at ? "Re-tailor" : "Tailor"}</Link></Button>
                <Button size="sm" disabled={markApplied.isPending} onClick={() => markApplied.mutate(j.id)}>Mark applied</Button>
                <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditJob(j)}><Pencil className="h-4 w-4" /></Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete"
                  onClick={() => { if (confirm(`Delete “${j.title}” at ${j.company}?`)) remove.mutate(j.id); }}
                ><Trash2 className="h-4 w-4" /></Button>
              </>
            } />
          ))}
        </div>
      )}

      <JobDetailDialog jobId={openId} open={!!openId} onOpenChange={(v) => !v && setOpenId(null)} />
      <JobFormDialog boards={boards} mode="edit" job={editJob} open={!!editJob} onOpenChange={(v) => !v && setEditJob(null)} />
    </div>
  );
}
