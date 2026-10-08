import { Link } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, CheckCircle2, Send, Wand2 } from "lucide-react";

import { jobsApi, type JobCard } from "@/api/jobs";
import { invalidateJobs } from "@/hooks/use-jobs";
import { useToday } from "@/hooks/use-overview";
import { JobDetailDialog } from "@/components/job-detail-dialog";
import { PageTitle } from "@/components/page-title";
import { PageHeader } from "@/components/shared/page-header";
import { JobRow } from "@/components/shared/job-row";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TodayPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useToday();
  const [openId, setOpenId] = useState<string | null>(null);

  const snooze = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number | null }) => jobsApi.setFollowUp(id, days === null ? null : isoDate(days)),
    onSuccess: (_r, v) => { toast.success(v.days === null ? "Follow-up cleared" : `Reminder moved ${v.days} days out`); invalidateJobs(qc); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });
  const markApplied = useMutation({
    mutationFn: (id: string) => jobsApi.bulkUpdateStatus([id], "applied"),
    onSuccess: () => { toast.success("Marked as applied"); invalidateJobs(qc); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  const nothing = data && !data.follow_ups.length && !data.ready_to_apply.length && !data.to_tailor.length;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageTitle title="Today" />
      <PageHeader
        title="Today"
        description={data ? new Date(`${data.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : undefined}
      />

      {isLoading || !data ? (
        <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-40" /></div>
      ) : (
        <div className="space-y-8">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-baseline justify-between text-sm">
              <span><b className="text-lg tabular-nums">{data.applied_today}</b> applied today</span>
              <span className="text-muted-foreground">{data.weekly.done} of {data.weekly.target} this week</span>
            </div>
            <Progress value={Math.min(100, (data.weekly.done / Math.max(1, data.weekly.target)) * 100)} className="mt-2 h-1.5" />
          </div>

          {nothing && (
            <EmptyState
              icon={CheckCircle2}
              title="You're all caught up"
              description="No follow-ups due and nothing waiting to send. Find something new in Discovery."
              action={<Button asChild size="sm"><Link to="/discovery">Open Discovery</Link></Button>}
            />
          )}

          {data.follow_ups.length > 0 && (
            <Section icon={BellRing} title="Follow up" count={data.follow_ups.length} hint="Applications that have gone quiet. A short, polite nudge goes a long way.">
              {data.follow_ups.map((j) => (
                <JobRow key={j.id} job={j} onOpen={setOpenId} actions={
                  <>
                    <Button size="sm" variant="outline" onClick={() => setOpenId(j.id)}>Open</Button>
                    <Button size="sm" variant="ghost" disabled={snooze.isPending} onClick={() => snooze.mutate({ id: j.id, days: 3 })}>Snooze 3d</Button>
                    <Button size="sm" variant="ghost" disabled={snooze.isPending} onClick={() => snooze.mutate({ id: j.id, days: null })}>Done</Button>
                  </>
                } />
              ))}
            </Section>
          )}

          {data.ready_to_apply.length > 0 && (
            <Section icon={Send} title="Ready to apply" count={data.ready_to_apply.length} hint="Saved jobs with a tailored resume. Apply, then mark them done.">
              {data.ready_to_apply.map((j) => <SavedRow key={j.id} job={j} onOpen={setOpenId} onApplied={() => markApplied.mutate(j.id)} busy={markApplied.isPending} />)}
            </Section>
          )}

          {data.to_tailor.length > 0 && (
            <Section icon={Wand2} title="Tailor next" count={data.to_tailor.length} hint="Newest saved jobs that don't have a tailored resume yet.">
              {data.to_tailor.map((j) => <SavedRow key={j.id} job={j} onOpen={setOpenId} onApplied={() => markApplied.mutate(j.id)} busy={markApplied.isPending} tailor />)}
            </Section>
          )}
        </div>
      )}

      <JobDetailDialog jobId={openId} open={!!openId} onOpenChange={(v) => !v && setOpenId(null)} />
    </div>
  );
}

function SavedRow({ job, onOpen, onApplied, busy, tailor }: { job: JobCard; onOpen: (id: string) => void; onApplied: () => void; busy: boolean; tailor?: boolean }) {
  return (
    <JobRow job={job} onOpen={onOpen} actions={
      <>
        <Button asChild size="sm" variant={tailor ? "default" : "outline"}><Link to={`/generate?job=${job.id}`}><Wand2 className="mr-1 h-3.5 w-3.5" />{tailor ? "Tailor" : "Re-tailor"}</Link></Button>
        <Button size="sm" variant={tailor ? "outline" : "default"} disabled={busy} onClick={onApplied}>Mark applied</Button>
      </>
    } />
  );
}

function Section({ icon: Icon, title, count, hint, children }: { icon: any; title: string; count: number; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
