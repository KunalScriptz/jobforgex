import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Briefcase, FileText, Trophy, ThumbsDown, Sparkles, Trash2, CheckSquare, X } from "lucide-react";

import { listJobs, bulkUpdateStatus, deleteJob } from "@/lib/jobs.functions";
import { listBoards } from "@/lib/workspace.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { JobDetailDialog } from "@/components/job-detail-dialog";
import { CompanyLogo } from "@/components/company-logo";

export const Route = createFileRoute("/_authenticated/jobs")({ component: JobsPage });

type Status = "wishlist" | "applied" | "interview" | "offer" | "rejected";

const COLUMNS: { id: Status; label: string; icon: any; accent: string }[] = [
  { id: "wishlist",  label: "Wishlist",  icon: Sparkles,   accent: "text-sky-500" },
  { id: "applied",   label: "Applied",   icon: FileText,   accent: "text-violet-500" },
  { id: "interview", label: "Interview", icon: Briefcase,  accent: "text-amber-500" },
  { id: "offer",     label: "Offer",     icon: Trophy,     accent: "text-emerald-500" },
  { id: "rejected",  label: "Rejected",  icon: ThumbsDown, accent: "text-rose-500" },
];

function JobsPage() {
  const qc = useQueryClient();
  const getJobs = useServerFn(listJobs);
  const getBoards = useServerFn(listBoards);
  const bulk = useServerFn(bulkUpdateStatus);
  const del = useServerFn(deleteJob);
  const [search, setSearch] = useState("");
  const [board, setBoard] = useState<string>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<Status | "">("");

  // Per-column order override, persisted per workspace/browser.
  const ORDER_KEY = "jobforgex:columnOrder:v1";
  const [orderMap, setOrderMap] = useState<Record<Status, string[]>>(() => {
    if (typeof window === "undefined") return { wishlist: [], applied: [], interview: [], offer: [], rejected: [] };
    try {
      return JSON.parse(localStorage.getItem(ORDER_KEY) || "") || { wishlist: [], applied: [], interview: [], offer: [], rejected: [] };
    } catch {
      return { wishlist: [], applied: [], interview: [], offer: [], rejected: [] };
    }
  });
  function persistOrder(next: Record<Status, string[]>) {
    setOrderMap(next);
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch {}
  }

  const { data: boards = [] } = useQuery({ queryKey: ["boards"], queryFn: () => getBoards() });
  const { data: allJobs = [] } = useQuery({
    queryKey: ["jobs", "all"],
    queryFn: () => getJobs({ data: {} } as any),
  });

  const filtered = useMemo(() => {
    return allJobs.filter((j: any) => {
      if (board !== "all" && j.board_id !== board) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(j.company + j.title + (j.description ?? "") + (j.notes ?? "")).toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [allJobs, board, search]);

  const byStatus = useMemo(() => {
    const m: Record<Status, any[]> = { wishlist: [], applied: [], interview: [], offer: [], rejected: [] };
    for (const j of filtered) (m[j.status as Status] ?? m.wishlist).push(j);
    // Apply saved order per column: known ids first (in saved order), then new ids by created_at.
    (Object.keys(m) as Status[]).forEach((s) => {
      const saved = orderMap[s] ?? [];
      const byId = new Map(m[s].map((j) => [j.id, j]));
      const ordered: any[] = [];
      for (const id of saved) if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); }
      for (const j of m[s]) if (byId.has(j.id)) ordered.push(j);
      m[s] = ordered;
    });
    return m;
  }, [filtered, orderMap]);

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) =>
      bulk({ data: { ids: [id], status } } as any),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["jobs", "all"] });
      const prev = qc.getQueryData<any[]>(["jobs", "all"]);
      qc.setQueryData<any[]>(["jobs", "all"], (old = []) =>
        old.map((j) => (j.id === id ? { ...j, status } : j)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["jobs", "all"], ctx.prev);
      toast.error("Failed to move card");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const bulkMove = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: Status }) =>
      bulk({ data: { ids, status } } as any),
    onSuccess: (_r, v) => {
      toast.success(`Moved ${v.ids.length} ${v.ids.length === 1 ? "job" : "jobs"} to ${v.status}`);
      setSelected(new Set());
      setBulkStatus("");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const activeJob = activeId ? filtered.find((j: any) => j.id === activeId) : null;

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const activeIdStr = e.active.id as string;
    const overId = e.over?.id as string | undefined;
    if (!overId) return;
    const activeJob = filtered.find((j: any) => j.id === activeIdStr);
    if (!activeJob) return;

    // Dropped directly on a column droppable → move to that column (append to end).
    const columnIds = COLUMNS.map((c) => c.id) as string[];
    if (columnIds.includes(overId)) {
      const targetStatus = overId as Status;
      const next = { ...orderMap };
      // Remove from any column it was in.
      (Object.keys(next) as Status[]).forEach((s) => { next[s] = (next[s] ?? []).filter((x) => x !== activeIdStr); });
      next[targetStatus] = [...(next[targetStatus] ?? []), activeIdStr];
      persistOrder(next);
      if (activeJob.status !== targetStatus) move.mutate({ id: activeIdStr, status: targetStatus });
      return;
    }

    // Dropped on another card → reorder (same column) or insert (cross column).
    const overJob = filtered.find((j: any) => j.id === overId);
    if (!overJob) return;
    const targetStatus = overJob.status as Status;

    const next = { ...orderMap };
    const currentIdsForTarget = byStatus[targetStatus].map((j: any) => j.id);
    // Remove active from every column first.
    (Object.keys(next) as Status[]).forEach((s) => { next[s] = (next[s] ?? []).filter((x) => x !== activeIdStr); });

    if (activeJob.status === targetStatus) {
      const oldIndex = currentIdsForTarget.indexOf(activeIdStr);
      const newIndex = currentIdsForTarget.indexOf(overId);
      next[targetStatus] = arrayMove(currentIdsForTarget, oldIndex, newIndex);
    } else {
      const idsWithoutActive = currentIdsForTarget.filter((x) => x !== activeIdStr);
      const insertAt = idsWithoutActive.indexOf(overId);
      const before = idsWithoutActive.slice(0, insertAt);
      const after = idsWithoutActive.slice(insertAt);
      next[targetStatus] = [...before, activeIdStr, ...after];
      move.mutate({ id: activeIdStr, status: targetStatus });
    }
    persistOrder(next);
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-2xl font-bold">Job Board</h1>
        <Input
          placeholder="Filter..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={board} onValueChange={setBoard}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All boards</SelectItem>
            {boards.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={selectMode ? "default" : "outline"}
          onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
          className="ml-auto"
        >
          <CheckSquare className="mr-1.5 h-4 w-4" />
          {selectMode ? "Exit select" : "Select"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {selectMode ? "Tap cards to select · bulk-move below" : "Drag cards or use Select to bulk-move"}
        </span>
      </div>

      {selectMode && selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-semibold">{selected.size} selected</span>
          <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as Status)}>
            <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Move to…" /></SelectTrigger>
            <SelectContent>
              {COLUMNS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!bulkStatus || bulkMove.isPending}
            onClick={() => bulkMove.mutate({ ids: Array.from(selected), status: bulkStatus as Status })}
          >Apply</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="mr-1 h-3.5 w-3.5" />Clear
          </Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              col={col}
              jobs={byStatus[col.id]}
              selectMode={selectMode}
              selected={selected}
              onToggleSelect={toggleSelect}
              onOpen={(id) => setOpenId(id)}
              onDelete={async (id) => {
                await del({ data: { id } } as any);
                qc.invalidateQueries({ queryKey: ["jobs"] });
              }}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeJob ? <JobCard job={activeJob} dragging /> : null}
        </DragOverlay>
      </DndContext>

      <JobDetailDialog
        jobId={openId}
        open={!!openId}
        onOpenChange={(v) => !v && setOpenId(null)}
      />
    </div>
  );
}

function Column({
  col,
  jobs,
  selectMode,
  selected,
  onToggleSelect,
  onOpen,
  onDelete,
}: {
  col: { id: Status; label: string; icon: any; accent: string };
  jobs: any[];
  selectMode: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const Icon = col.icon;
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${col.accent}`} />
          <span className="text-xs font-bold uppercase tracking-wider">{col.label}</span>
        </div>
        <span className="text-xs text-muted-foreground">{jobs.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        <SortableContext items={jobs.map((j) => j.id)} strategy={verticalListSortingStrategy}>
          {jobs.map((j) => (
            <SortableCard
              key={j.id}
              job={j}
              selectMode={selectMode}
              selected={selected.has(j.id)}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>
        {jobs.length === 0 && (
          <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

function SortableCard({
  job, selectMode, selected, onToggleSelect, onOpen, onDelete,
}: {
  job: any;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
    disabled: selectMode,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(selectMode ? {} : attributes)}
      {...(selectMode ? {} : listeners)}
      className={isDragging ? "opacity-30" : ""}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-stop]")) return;
        if (selectMode) onToggleSelect(job.id);
        else onOpen(job.id);
      }}
    >
      <JobCard job={job} selectMode={selectMode} selected={selected} onDelete={onDelete} />
    </div>
  );
}

function JobCard({
  job,
  onDelete,
  dragging,
  selectMode,
  selected,
}: {
  job: any;
  onDelete?: (id: string) => void;
  dragging?: boolean;
  selectMode?: boolean;
  selected?: boolean;
}) {
  return (
    <div
      className={`group rounded-lg border bg-card p-3 shadow-sm transition-all hover:shadow-md ${
        selectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
      } ${dragging ? "rotate-2 shadow-xl" : ""} ${
        selected ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="mb-1 flex items-start gap-2">
        {selectMode && (
          <div data-stop className="pt-0.5">
            <Checkbox checked={!!selected} />
          </div>
        )}
        <CompanyLogo company={job.company} size={26} />
        <div className="min-w-0 flex-1">
      <div className="mb-1 text-sm font-semibold leading-tight">{job.title}</div>
      <div className="text-xs text-muted-foreground">{job.company}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {job.date_applied ?? new Date(job.created_at).toLocaleDateString()}
        </span>
        {onDelete && (
          <button
            data-stop
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(job.id);
            }}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        )}
      </div>
    </div>
  );
}