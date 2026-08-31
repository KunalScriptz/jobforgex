import { useQueryClient, useMutation } from "@tanstack/react-query";
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
import { Briefcase, FileText, Trophy, ThumbsDown, Sparkles, Trash2, CheckSquare, X, Plus, Pencil } from "lucide-react";

import { jobsApi } from "@/api/jobs";
import { useJobs } from "@/hooks/use-jobs";
import { useBoards } from "@/hooks/use-workspace";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CompanyAutocomplete } from "@/components/company-autocomplete";
import { JobDetailDialog } from "@/components/job-detail-dialog";
import { CompanyLogo } from "@/components/company-logo";
import { hostnameFromUrl } from "@/lib/company";
import { PageTitle } from "@/components/page-title";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { ProfileNudge } from "@/components/profile-nudge";

type Status = "wishlist" | "applied" | "interview" | "offer" | "rejected";

const COLUMNS: { id: Status; label: string; icon: any; accent: string }[] = [
  { id: "wishlist",  label: "Wishlist",  icon: Sparkles,   accent: "text-sky-500" },
  { id: "applied",   label: "Applied",   icon: FileText,   accent: "text-violet-500" },
  { id: "interview", label: "Interview", icon: Briefcase,  accent: "text-amber-500" },
  { id: "offer",     label: "Offer",     icon: Trophy,     accent: "text-emerald-500" },
  { id: "rejected",  label: "Rejected",  icon: ThumbsDown, accent: "text-rose-500" },
];

export default function JobsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [board, setBoard] = useState<string>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editJob, setEditJob] = useState<any | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<Status | "">("");

  // Per-column sort mode (persisted). "manual" keeps drag order; others override.
  type SortMode = "manual" | "newest" | "oldest" | "az" | "za";
  const SORT_KEY = "jobforgex:columnSort:v1";
  const [sortMap, setSortMap] = useState<Record<Status, SortMode>>(() => {
    const def: Record<Status, SortMode> = { wishlist: "manual", applied: "manual", interview: "manual", offer: "manual", rejected: "manual" };
    if (typeof window === "undefined") return def;
    try { return { ...def, ...(JSON.parse(localStorage.getItem(SORT_KEY) || "") || {}) }; } catch { return def; }
  });
  function setColumnSort(status: Status, mode: SortMode) {
    const next = { ...sortMap, [status]: mode };
    setSortMap(next);
    try { localStorage.setItem(SORT_KEY, JSON.stringify(next)); } catch {}
  }

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

  const { data: boards = [] } = useBoards();
  const { data: allJobs = [] } = useJobs();

  const filtered = useMemo(() => {
    return allJobs.filter((j: any) => {
      if (board !== "all" && j.board_id !== board) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(j.company + j.title + (j.description ?? "") + (j.notes ?? "") + (j.location ?? "")).toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [allJobs, board, search]);

  const byStatus = useMemo(() => {
    const m: Record<Status, any[]> = { wishlist: [], applied: [], interview: [], offer: [], rejected: [] };
    for (const j of filtered) (m[j.status as Status] ?? m.wishlist).push(j);
    // Apply saved order per column: known ids first (in saved order), then new ids by created_at.
    (Object.keys(m) as Status[]).forEach((s) => {
      const mode = sortMap[s] ?? "manual";
      if (mode !== "manual") {
        const arr = [...m[s]];
        const t = (j: any) => new Date(j.created_at ?? j.updated_at ?? 0).getTime();
        if (mode === "newest") arr.sort((a, b) => t(b) - t(a));
        else if (mode === "oldest") arr.sort((a, b) => t(a) - t(b));
        else if (mode === "az") arr.sort((a, b) => String(a.company ?? "").localeCompare(String(b.company ?? "")));
        else if (mode === "za") arr.sort((a, b) => String(b.company ?? "").localeCompare(String(a.company ?? "")));
        m[s] = arr;
        return;
      }
      const saved = orderMap[s] ?? [];
      const byId = new Map(m[s].map((j) => [j.id, j]));
      const ordered: any[] = [];
      for (const id of saved) if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); }
      for (const j of m[s]) if (byId.has(j.id)) ordered.push(j);
      m[s] = ordered;
    });
    return m;
  }, [filtered, orderMap, sortMap]);

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) =>
      jobsApi.bulkUpdateStatus([id], status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["jobs", undefined] });
      const prev = qc.getQueryData<any[]>(["jobs", undefined]);
      qc.setQueryData<any[]>(["jobs", undefined], (old = []) =>
        old.map((j) => (j.id === id ? { ...j, status } : j)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["jobs", undefined], ctx.prev);
      toast.error("Failed to move card");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const bulkMove = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: Status }) =>
      jobsApi.bulkUpdateStatus(ids, status),
    onSuccess: (_r, v) => {
      toast.success(`Moved ${v.ids.length} ${v.ids.length === 1 ? "job" : "jobs"} to ${v.status}`);
      setSelected(new Set());
      setBulkStatus("");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => jobsApi.bulkDelete(ids),
    onSuccess: (_r, ids) => {
      toast.success(`Deleted ${ids.length} ${ids.length === 1 ? "job" : "jobs"}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  function selectAllVisible() {
    setSelected(new Set(filtered.map((j: any) => j.id)));
  }
  function selectColumn(status: Status) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const j of byStatus[status]) next.add(j.id);
      return next;
    });
  }

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
      <PageTitle title="Dashboard" />
      <ProfileNudge />
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
        <AddJobDialog boards={boards} />
        <OnboardingGuide />
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
          <Button
            size="sm"
            variant="destructive"
            disabled={bulkDelete.isPending}
            onClick={() => {
              if (confirm(`Delete ${selected.size} job(s)? This cannot be undone.`)) {
                bulkDelete.mutate(Array.from(selected));
              }
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="mr-1 h-3.5 w-3.5" />Clear
          </Button>
        </div>
      )}
      {selectMode && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Quick select:</span>
          <Button size="sm" variant="outline" className="h-7" onClick={selectAllVisible}>
            All visible ({filtered.length})
          </Button>
          {COLUMNS.map((c) => byStatus[c.id].length > 0 && (
            <Button key={c.id} size="sm" variant="outline" className="h-7" onClick={() => selectColumn(c.id)}>
              {c.label} ({byStatus[c.id].length})
            </Button>
          ))}
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
              sortMode={sortMap[col.id] ?? "manual"}
              onSortChange={(m) => setColumnSort(col.id, m)}
              selectMode={selectMode}
              selected={selected}
              onToggleSelect={toggleSelect}
              onOpen={(id) => setOpenId(id)}
              onEdit={(job) => setEditJob(job)}
              onDelete={async (id) => {
                await jobsApi.deleteJob(id);
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
      <JobFormDialog
        boards={boards}
        mode="edit"
        job={editJob}
        open={!!editJob}
        onOpenChange={(v) => !v && setEditJob(null)}
      />
    </div>
  );
}

function Column({
  col,
  jobs,
  sortMode,
  onSortChange,
  selectMode,
  selected,
  onToggleSelect,
  onOpen,
  onEdit,
  onDelete,
}: {
  col: { id: Status; label: string; icon: any; accent: string };
  jobs: any[];
  sortMode: "manual" | "newest" | "oldest" | "az" | "za";
  onSortChange: (m: "manual" | "newest" | "oldest" | "az" | "za") => void;
  selectMode: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onEdit: (job: any) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const Icon = col.icon;
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-1 lg:min-w-0 flex-col rounded-xl border bg-muted/30 transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${col.accent}`} />
          <span className="text-xs font-bold uppercase tracking-wider">{col.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={sortMode} onValueChange={(v) => onSortChange(v as any)}>
            <SelectTrigger className="h-6 w-[110px] px-1.5 text-[10px]" aria-label="Sort column">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="az">Company A–Z</SelectItem>
              <SelectItem value="za">Company Z–A</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{jobs.length}</span>
        </div>
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
              onEdit={onEdit}
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
  job, selectMode, selected, onToggleSelect, onOpen, onEdit, onDelete,
}: {
  job: any;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onEdit: (job: any) => void;
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
      <JobCard job={job} selectMode={selectMode} selected={selected} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function JobCard({
  job,
  onDelete,
  onEdit,
  dragging,
  selectMode,
  selected,
}: {
  job: any;
  onDelete?: (id: string) => void;
  onEdit?: (job: any) => void;
  dragging?: boolean;
  selectMode?: boolean;
  selected?: boolean;
}) {
  return (
    <div
      className={`group rounded-lg border bg-card p-3 shadow-sm transition-all hover:border-primary/50 hover:bg-accent hover:text-accent-foreground hover:shadow-md ${
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
        <CompanyLogo company={job.company} domain={job.company_domain} url={job.url} size={26} />
        <div className="min-w-0 flex-1">
      <div className="mb-1 text-sm font-semibold leading-tight">{job.title}</div>
      <div className="text-xs text-muted-foreground">{job.company}</div>
      {job.location && <div className="text-[11px] text-muted-foreground/80">{job.location}</div>}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {job.date_applied ?? new Date(job.created_at).toLocaleDateString()}
        </span>
        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              data-stop
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onEdit(job); }}
              className="opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
            </button>
          )}
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
    </div>
  );
}
function AddJobDialog({ boards }: { boards: any[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Add job</Button>
      <JobFormDialog boards={boards} mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

function JobFormDialog({
  boards,
  mode,
  job,
  open,
  onOpenChange,
}: {
  boards: any[];
  mode: "create" | "edit";
  job?: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({
    company: "", title: "", description: "", board_id: "",
    status: "wishlist", date_applied: "", url: "", notes: "", location: "",
    company_domain: "",
  });

  // Reset/seed form when the dialog opens
  useMemo(() => {
    if (!open) return;
    if (mode === "edit" && job) {
      setForm({
        company: job.company ?? "",
        title: job.title ?? "",
        description: job.description ?? "",
        board_id: job.board_id ?? boards[0]?.id ?? "",
        status: job.status ?? "wishlist",
        date_applied: job.date_applied ?? "",
        url: job.url ?? "",
        notes: job.notes ?? "",
        location: job.location ?? "",
        company_domain: job.company_domain ?? "",
      });
    } else if (mode === "create" && !form.board_id && boards[0]?.id) {
      setForm((f: any) => ({ ...f, board_id: boards[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job?.id]);

  const submit = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (!payload.date_applied) delete payload.date_applied;
      if (!payload.url) delete payload.url;
      if (!payload.notes) delete payload.notes;
      if (!payload.location) delete payload.location;
      if (!payload.company_domain) {
        payload.company_domain = hostnameFromUrl(payload.url) ?? undefined;
      }
      if (!payload.company_domain) delete payload.company_domain;
      if (mode === "edit" && job) {
        return jobsApi.updateJob(job.id, payload);
      }
      return jobsApi.createJob(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job", job?.id] });
      toast.success(mode === "edit" ? "Job updated" : "Job added");
      onOpenChange(false);
      setForm({ ...form, company: "", title: "", description: "", url: "", notes: "", date_applied: "" });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{mode === "edit" ? "Edit job" : "Add job manually"}</DialogTitle></DialogHeader>
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
                <SelectContent>{COLUMNS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Date applied</Label><Input type="date" value={form.date_applied} onChange={(e) => setForm({ ...form, date_applied: e.target.value })} /></div>
          </div>
          <div><Label>Job URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
          <div><Label>Location</Label><Input placeholder="e.g. Remote · Bengaluru, IN" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div><Label>Description {mode === "create" ? "*" : ""}</Label><Textarea required={mode === "create"} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter>
            <Button type="submit" disabled={submit.isPending || !form.board_id}>{mode === "edit" ? "Save" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
