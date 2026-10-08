import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { jobsApi } from "@/api/jobs";
import { invalidateJobs } from "@/hooks/use-jobs";
import { ALL_STATUSES, statusLabel } from "@/lib/job-status";
import { hostnameFromUrl } from "@/lib/company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CompanyAutocomplete } from "@/components/company-autocomplete";

const EMPTY = {
  company: "", title: "", description: "", board_id: "",
  status: "wishlist", date_applied: "", url: "", notes: "", location: "", company_domain: "",
};

/** Human-readable message from an API error, including the 409 "already saved" shape. */
function apiErrorMessage(e: any): string {
  const detail = e?.response?.data?.detail;
  if (detail && typeof detail === "object" && detail.message) return `${detail.message}: this URL is already in your jobs.`;
  if (typeof detail === "string") return detail;
  return String(e?.message ?? e).slice(0, 200);
}

export function AddJobButton({ boards, label = "Add job" }: { boards: any[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />{label}</Button>
      <JobFormDialog boards={boards} mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * Add / edit a job. In edit mode the full job is fetched first: list endpoints return slim cards
 * (no description or notes), and saving a form seeded from a card would blank those fields.
 */
export function JobFormDialog({
  boards, mode, job, open, onOpenChange,
}: {
  boards: any[];
  mode: "create" | "edit";
  job?: { id: string } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(EMPTY);

  const editing = mode === "edit" && !!job;
  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ["jobs", job?.id],
    queryFn: () => jobsApi.getJob(job!.id),
    enabled: open && editing,
  });
  const full = detail?.job ?? null;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      if (!full) return;
      setForm({
        company: full.company ?? "",
        title: full.title ?? "",
        description: full.description ?? "",
        board_id: full.board_id ?? boards[0]?.id ?? "",
        status: full.status ?? "wishlist",
        date_applied: full.date_applied ?? "",
        url: full.url ?? "",
        notes: full.notes ?? "",
        location: full.location ?? "",
        company_domain: full.company_domain ?? "",
      });
    } else {
      setForm((f: any) => ({ ...EMPTY, status: f.status || "wishlist", board_id: f.board_id || boards[0]?.id || "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job?.id, full?.id]);

  const submit = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      for (const key of ["date_applied", "url", "notes", "location"]) if (!payload[key]) delete payload[key];
      if (!payload.company_domain) payload.company_domain = hostnameFromUrl(payload.url) ?? undefined;
      if (!payload.company_domain) delete payload.company_domain;
      return editing ? jobsApi.updateJob(job!.id, payload) : jobsApi.createJob(payload);
    },
    onSuccess: () => {
      invalidateJobs(qc);
      qc.invalidateQueries({ queryKey: ["job", job?.id] });
      toast.success(editing ? "Job updated" : "Job added");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(apiErrorMessage(e)),
  });

  const blocked = submit.isPending || !form.board_id || (editing && loadingDetail);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit job" : "Add job manually"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>Company</Label>
              <span className="text-xs text-muted-foreground">Required</span>
            </div>
            <CompanyAutocomplete
              value={form.company}
              onChange={(v) => setForm({ ...form, company: v })}
              onPick={(s) => setForm({ ...form, company: s.name, url: form.url || `https://${s.domain}`, company_domain: s.domain })}
              placeholder="Start typing…"
              required
            />
          </div>
          <div><Label>Title *</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Board *</Label>
            <Select value={form.board_id} onValueChange={(v) => setForm({ ...form, board_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select board" /></SelectTrigger>
              <SelectContent>{boards.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Date applied</Label><Input type="date" value={form.date_applied} onChange={(e) => setForm({ ...form, date_applied: e.target.value })} /></div>
          </div>
          <div><Label>Job URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
          <div><Label>Location</Label><Input placeholder="e.g. Remote · Bengaluru, IN" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div><Label>Description {editing ? "" : "*"}</Label><Textarea required={!editing} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter>
            <Button type="submit" disabled={blocked}>{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
