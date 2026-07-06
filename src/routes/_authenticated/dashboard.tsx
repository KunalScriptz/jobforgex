import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { listJobs, updateJob, createJob, deleteJob } from "@/lib/jobs.functions";
import { listBoards } from "@/lib/workspace.functions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, ExternalLink, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: DashboardPage });

const COLUMNS = [
  { key: "wishlist", label: "Wishlist" },
  { key: "applied", label: "Applied" },
  { key: "interview", label: "Interview" },
  { key: "rejected", label: "Rejected" },
  { key: "offer", label: "Offer" },
] as const;

function DashboardPage() {
  const qc = useQueryClient();
  const getJobs = useServerFn(listJobs);
  const getBoards = useServerFn(listBoards);
  const upd = useServerFn(updateJob);
  const del = useServerFn(deleteJob);

  const [boardId, setBoardId] = useState<string | undefined>();

  const { data: boards = [] } = useQuery({ queryKey: ["boards"], queryFn: () => getBoards() });
  const activeBoard = boardId ?? boards[0]?.id;
  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs", activeBoard],
    queryFn: () => getJobs({ data: { board_id: activeBoard ?? null } } as any),
    enabled: Boolean(activeBoard),
  });

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { wishlist: [], applied: [], interview: [], rejected: [], offer: [] };
    for (const j of jobs) g[j.status]?.push(j);
    return g;
  }, [jobs]);

  const move = useMutation({
    mutationFn: async (v: { id: string; status: string }) => upd({ data: v } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => del({ data: { id } } as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs"] }); toast.success("Deleted"); },
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Board</h1>
          <p className="text-sm text-muted-foreground">Your job pipeline.</p>
        </div>
        <div className="flex items-center gap-2">
          {boards.length > 0 && (
            <Select value={activeBoard} onValueChange={setBoardId}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {boards.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <AddJobDialog boards={boards} activeBoard={activeBoard} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border bg-card p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold text-sm">{label}</div>
              <Badge variant="secondary">{grouped[key]?.length ?? 0}</Badge>
            </div>
            <div className="space-y-2">
              {grouped[key]?.map((j) => (
                <div key={j.id} className="rounded-md border bg-background p-3 text-sm">
                  <div className="font-medium">{j.title}</div>
                  <div className="text-xs text-muted-foreground">{j.company}</div>
                  {j.resume_score != null && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                      Score {j.resume_score}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-1">
                    <Select value={j.status} onValueChange={(v) => move.mutate({ id: j.id, status: v })}>
                      <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COLUMNS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {j.url && (
                      <a href={j.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button onClick={() => remove.mutate(j.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {grouped[key]?.length === 0 && <div className="text-xs text-muted-foreground">No jobs</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddJobDialog({ boards, activeBoard }: { boards: any[]; activeBoard?: string }) {
  const qc = useQueryClient();
  const create = useServerFn(createJob);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    company: "", title: "", description: "", board_id: activeBoard ?? "",
    status: "wishlist", date_applied: "", url: "", notes: "",
  });

  const submit = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (!payload.date_applied) delete payload.date_applied;
      if (!payload.url) delete payload.url;
      if (!payload.notes) delete payload.notes;
      return create({ data: payload } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Job added");
      setOpen(false);
      setForm({ ...form, company: "", title: "", description: "", url: "", notes: "", date_applied: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add job</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add job manually</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Company *</Label><Input required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div><Label>Title *</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          </div>
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
                <SelectContent>{COLUMNS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Date applied</Label><Input type="date" value={form.date_applied} onChange={(e) => setForm({ ...form, date_applied: e.target.value })} /></div>
          </div>
          <div><Label>Job URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
          <div><Label>Description *</Label><Textarea required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter>
            <Button type="submit" disabled={submit.isPending || !form.board_id}>Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}