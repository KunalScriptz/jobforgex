import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";

import { listJobs, bulkUpdateStatus, deleteJob } from "@/lib/jobs.functions";
import { listBoards } from "@/lib/workspace.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/jobs")({ component: JobsPage });

function JobsPage() {
  const qc = useQueryClient();
  const getJobs = useServerFn(listJobs);
  const getBoards = useServerFn(listBoards);
  const bulk = useServerFn(bulkUpdateStatus);
  const del = useServerFn(deleteJob);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [board, setBoard] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: boards = [] } = useQuery({ queryKey: ["boards"], queryFn: () => getBoards() });
  const { data: allJobs = [] } = useQuery({
    queryKey: ["jobs", "all"],
    queryFn: () => getJobs({ data: {} } as any),
  });

  const rows = useMemo(() => {
    return allJobs.filter((j: any) => {
      if (status !== "all" && j.status !== status) return false;
      if (board !== "all" && j.board_id !== board) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(j.company + j.title + (j.description ?? "") + (j.notes ?? "")).toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [allJobs, status, board, search]);

  function toggle(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  }

  const doBulk = useMutation({
    mutationFn: async (s: string) => bulk({ data: { ids: Array.from(selected), status: s } } as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs"] }); setSelected(new Set()); toast.success("Updated"); },
  });

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Jobs</h1>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search company, title, notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["wishlist","applied","interview","rejected","offer"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={board} onValueChange={setBoard}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All boards</SelectItem>
            {boards.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Select onValueChange={(v) => doBulk.mutate(v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Move to..." /></SelectTrigger>
              <SelectContent>
                {["wishlist","applied","interview","rejected","offer"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-8 p-2"></th>
              <th className="p-2">Company</th>
              <th className="p-2">Title</th>
              <th className="p-2">Status</th>
              <th className="p-2">Applied</th>
              <th className="p-2">Score</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j: any) => (
              <tr key={j.id} className="border-t">
                <td className="p-2"><Checkbox checked={selected.has(j.id)} onCheckedChange={() => toggle(j.id)} /></td>
                <td className="p-2 font-medium">{j.company}</td>
                <td className="p-2">{j.title}</td>
                <td className="p-2"><Badge variant="outline">{j.status}</Badge></td>
                <td className="p-2 text-muted-foreground">{j.date_applied ?? "—"}</td>
                <td className="p-2">{j.resume_score ?? "—"}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="ghost" onClick={async () => { await del({ data: { id: j.id } } as any); qc.invalidateQueries({ queryKey: ["jobs"] }); }}>Delete</Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No jobs match your filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}