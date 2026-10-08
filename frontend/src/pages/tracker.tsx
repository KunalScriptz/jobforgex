import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { Trash2, CheckSquare, X, Pencil, Download, Bookmark, KanbanSquare, Activity, MessageSquareReply, CalendarClock, Briefcase } from "lucide-react";

import { jobsApi, type JobCard as JobCardData } from "@/api/jobs";
import { invalidateJobs, useJobCards, useJobStats } from "@/hooks/use-jobs";
import { useBoards } from "@/hooks/use-workspace";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { JobDetailDialog } from "@/components/job-detail-dialog";
import { AddJobButton, JobFormDialog } from "@/components/job-form-dialog";
import { CompanyLogo } from "@/components/company-logo";
import { PageTitle } from "@/components/page-title";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { ProfileNudge } from "@/components/profile-nudge";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { AgeChip, FollowUpChip, ScoreBadge, SourceBadge } from "@/components/shared/chips";
import { ALL_STATUSES, STATUS_META, TRACKER_COLUMNS, statusLabel, type JobStatus } from "@/lib/job-status";
import { sourceLabel } from "@/lib/sources";
import { formatPercent } from "@/lib/format";

// Saved jobs (status "wishlist") live in Discovery; the board shows everything from Applied on.
const BOARD_PARAMS = { status: TRACKER_COLUMNS.join(","), limit: 1000 };
const BOARD_KEY = ["jobs", "cards", BOARD_PARAMS];

type SortMode = "manual" | "newest" | "oldest" | "az" | "za";
const SORT_KEY = "jobforgex:columnSort:v1";
const ORDER_KEY = "jobforgex:columnOrder:v1";

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return { ...fallback, ...(JSON.parse(localStorage.getItem(key) || "") || {}) }; } catch { return fallback; }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function TrackerPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [board, setBoard] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [minFit, setMinFit] = useState<string>("any");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editJob, setEditJob] = useState<JobCardData | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<JobStatus | "">("");
  const [exporting, setExporting] = useState(false);

  const [sortMap, setSortMap] = useState<Record<string, SortMode>>(() => readStored(SORT_KEY, {}));
  function setColumnSort(status: string, mode: SortMode) {
    const next = { ...sortMap, [status]: mode };
    setSortMap(next);
    try { localStorage.setItem(SORT_KEY, JSON.stringify(next)); } catch {}
  }

  // Per-column manual order, persisted per browser.
  const [orderMap, setOrderMap] = useState<Record<string, string[]>>(() => readStored(ORDER_KEY, {}));
  function persistOrder(next: Record<string, string[]>) {
    setOrderMap(next);
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch {}
  }

  const { data: boards = [] } = useBoards();
  const { data: cardData } = useJobCards(BOARD_PARAMS);
  const { data: stats } = useJobStats();
  const allJobs = cardData?.jobs ?? [];

  // Descriptions aren't on the cards, so a real search (3+ chars) is answered by the server,
  // which also looks in descriptions and notes. Shorter queries filter the loaded cards instantly.
  const debouncedSearch = useDebounced(search.trim(), 300);
  const serverSearch = debouncedSearch.length >= 3;
  const { data: hits } = useJobCards({ ...BOARD_PARAMS, search: debouncedSearch }, { enabled: serverSearch });
  const hitIds = useMemo(() => new Set((hits?.jobs ?? []).map((j) => j.id)), [hits]);

  const sources = useMemo(() => Array.from(new Set(allJobs.map((j) => j.source))).sort(), [allJobs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allJobs.filter((j) => {
      if (board !== "all" && j.board_id !== board) return false;
      if (source !== "all" && j.source !== source) return false;
      if (minFit !== "any" && (j.fit ?? -1) < Number(minFit)) return false;
      if (q) {
        if (serverSearch && hits && debouncedSearch.toLowerCase() === q) return hitIds.has(j.id);
        return `${j.company} ${j.title} ${j.location ?? ""} ${sourceLabel(j.source)}`.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allJobs, board, source, minFit, search, serverSearch, debouncedSearch, hits, hitIds]);

  const byStatus = useMemo(() => {
    const m: Record<string, JobCardData[]> = Object.fromEntries(TRACKER_COLUMNS.map((s) => [s, []]));
    for (const j of filtered) (m[j.status] ??= []).push(j);
    for (const s of TRACKER_COLUMNS) {
      const mode = sortMap[s] ?? "manual";
      if (mode !== "manual") {
        const arr = [...m[s]];
        const t = (j: JobCardData) => new Date(j.created_at ?? j.updated_at ?? 0).getTime();
        if (mode === "newest") arr.sort((a, b) => t(b) - t(a));
        else if (mode === "oldest") arr.sort((a, b) => t(a) - t(b));
        else if (mode === "az") arr.sort((a, b) => a.company.localeCompare(b.company));
        else if (mode === "za") arr.sort((a, b) => b.company.localeCompare(a.company));
        m[s] = arr;
        continue;
      }
      // Manual: ids with a saved position first (in that order), then the rest as the API sent them.
      const byId = new Map(m[s].map((j) => [j.id, j]));
      const ordered: JobCardData[] = [];
      for (const id of orderMap[s] ?? []) if (byId.has(id)) { ordered.push(byId.get(id)!); byId.delete(id); }
      for (const j of m[s]) if (byId.has(j.id)) ordered.push(j);
      m[s] = ordered;
    }
    return m;
  }, [filtered, orderMap, sortMap]);

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: JobStatus }) => jobsApi.bulkUpdateStatus([id], status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: BOARD_KEY });
      const prev = qc.getQueryData<{ jobs: JobCardData[]; total: number }>(BOARD_KEY);
      qc.setQueryData<{ jobs: JobCardData[]; total: number }>(BOARD_KEY, (old) =>
        old ? { ...old, jobs: old.jobs.map((j) => (j.id === id ? { ...j, status } : j)) } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(BOARD_KEY, ctx.prev);
      toast.error("Failed to move card");
    },
    onSettled: () => invalidateJobs(qc),
  });

  const bulkMove = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: JobStatus }) => jobsApi.bulkUpdateStatus(ids, status),
    onSuccess: (_r, v) => {
      toast.success(`Moved ${v.ids.length} ${v.ids.length === 1 ? "job" : "jobs"} to ${statusLabel(v.status)}`);
      setSelected(new Set());
      setBulkStatus("");
      invalidateJobs(qc);
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => jobsApi.bulkDelete(ids),
    onSuccess: (_r, ids) => {
      toast.success(`Deleted ${ids.length} ${ids.length === 1 ? "job" : "jobs"}`);
      setSelected(new Set());
      invalidateJobs(qc);
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await jobsApi.exportJobs();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jobforge_jobs_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Exported jobs to Excel");
    } catch (e: any) {
      toast.error(String(e?.message ?? e).slice(0, 200));
    } finally {
      setExporting(false);
    }
  }

  const selectAllVisible = () => setSelected(new Set(filtered.map((j) => j.id)));
  const selectColumn = (status: string) =>
    setSelected((prev) => { const next = new Set(prev); for (const j of byStatus[status] ?? []) next.add(j.id); return next; });
  const toggleSelect = (id: string) =>
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const activeJob = activeId ? filtered.find((j) => j.id === activeId) : null;

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const activeIdStr = e.active.id as string;
    const overId = e.over?.id as string | undefined;
    if (!overId) return;
    const dragged = filtered.find((j) => j.id === activeIdStr);
    if (!dragged) return;

    const withoutActive = (): Record<string, string[]> => {
      const next = { ...orderMap };
      for (const s of Object.keys(next)) next[s] = (next[s] ?? []).filter((x) => x !== activeIdStr);
      return next;
    };

    // Dropped on a column: append to it.
    if ((TRACKER_COLUMNS as string[]).includes(overId)) {
      const next = withoutActive();
      next[overId] = [...(next[overId] ?? []), activeIdStr];
      persistOrder(next);
      if (dragged.status !== overId) move.mutate({ id: activeIdStr, status: overId as JobStatus });
      return;
    }

    // Dropped on another card: reorder within a column, or insert across columns.
    const overJob = filtered.find((j) => j.id === overId);
    if (!overJob) return;
    const target = overJob.status;
    const next = withoutActive();
    const currentIds = (byStatus[target] ?? []).map((j) => j.id);
    if (dragged.status === target) {
      next[target] = arrayMove(currentIds, currentIds.indexOf(activeIdStr), currentIds.indexOf(overId));
    } else {
      const ids = currentIds.filter((x) => x !== activeIdStr);
      const at = ids.indexOf(overId);
      next[target] = [...ids.slice(0, at), activeIdStr, ...ids.slice(at)];
      move.mutate({ id: activeIdStr, status: target });
    }
    persistOrder(next);
  }

  const saved = stats?.by_status.wishlist ?? 0;

  return (
    <div className="flex h-full flex-col p-4">
      <PageTitle title="Tracker" />
      <ProfileNudge />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active applications" value={stats?.active ?? "–"} icon={Activity} hint={`${stats?.total ?? 0} jobs in total`} />
        <StatCard
          label="Reply rate · 30d"
          value={formatPercent(stats?.reply_rate_30d)}
          icon={MessageSquareReply}
          hint={stats ? `${stats.replied_30d} of ${stats.applied_30d} applications heard back` : undefined}
        />
        <StatCard label="Interviewing" value={stats?.interviewing ?? "–"} icon={Briefcase} hint={stats ? `${stats.offers} offer${stats.offers === 1 ? "" : "s"}` : undefined} tone={stats?.interviewing ? "good" : "default"} />
        <StatCard
          label="Follow-ups due"
          value={stats?.follow_ups_due ?? "–"}
          icon={CalendarClock}
          tone={stats?.follow_ups_due ? "bad" : "default"}
          hint={stats?.follow_ups_due ? "Open Today to chase them" : "Nothing overdue"}
        />
      </div>

      {saved > 0 && (
        <Link
          to="/discovery"
          className="mb-3 flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm text-sky-700 transition-colors hover:bg-sky-500/10 dark:text-sky-300"
        >
          <Bookmark className="h-4 w-4" />
          <span><b>{saved}</b> saved {saved === 1 ? "job is" : "jobs are"} waiting in Discovery. Mark one as applied and it moves here.</span>
        </Link>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search company, title, description…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <Select value={board} onValueChange={setBoard}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All boards</SelectItem>
            {boards.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {sources.length > 1 && (
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map((s) => <SelectItem key={s} value={s}>{sourceLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={minFit} onValueChange={setMinFit}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any fit</SelectItem>
            <SelectItem value="50">Fit 50+</SelectItem>
            <SelectItem value="75">Fit 75+</SelectItem>
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
        <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
          <Download className="mr-1.5 h-4 w-4" />
          {exporting ? "Exporting…" : "Export"}
        </Button>
        <AddJobButton boards={boards} />
        <OnboardingGuide />
      </div>

      {selectMode && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-semibold">{selected.size} selected</span>
          <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as JobStatus)}>
            <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Move to…" /></SelectTrigger>
            <SelectContent>
              {ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!bulkStatus || bulkMove.isPending} onClick={() => bulkMove.mutate({ ids: Array.from(selected), status: bulkStatus as JobStatus })}>Apply</Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={bulkDelete.isPending}
            onClick={() => { if (confirm(`Delete ${selected.size} job(s)? This cannot be undone.`)) bulkDelete.mutate(Array.from(selected)); }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X className="mr-1 h-3.5 w-3.5" />Clear</Button>
        </div>
      )}
      {selectMode && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Quick select:</span>
          <Button size="sm" variant="outline" className="h-7" onClick={selectAllVisible}>All visible ({filtered.length})</Button>
          {TRACKER_COLUMNS.map((s) => (byStatus[s]?.length ?? 0) > 0 && (
            <Button key={s} size="sm" variant="outline" className="h-7" onClick={() => selectColumn(s)}>
              {statusLabel(s)} ({byStatus[s].length})
            </Button>
          ))}
        </div>
      )}

      {cardData && allJobs.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="No applications yet"
          description="Once you mark a saved job as applied it shows up here, and the board tracks every reply from there."
          action={<Button asChild size="sm"><Link to="/discovery">Go to Discovery</Link></Button>}
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
          onDragCancel={() => setActiveId(null)}
          onDragEnd={onDragEnd}
        >
          <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
            {TRACKER_COLUMNS.map((status) => (
              <Column
                key={status}
                status={status}
                jobs={byStatus[status] ?? []}
                sortMode={sortMap[status] ?? "manual"}
                onSortChange={(m) => setColumnSort(status, m)}
                selectMode={selectMode}
                selected={selected}
                onToggleSelect={toggleSelect}
                onOpen={setOpenId}
                onEdit={setEditJob}
                onDelete={async (id) => { await jobsApi.deleteJob(id); invalidateJobs(qc); }}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>{activeJob ? <Card job={activeJob} dragging /> : null}</DragOverlay>
        </DndContext>
      )}

      <JobDetailDialog jobId={openId} open={!!openId} onOpenChange={(v) => !v && setOpenId(null)} />
      <JobFormDialog boards={boards} mode="edit" job={editJob} open={!!editJob} onOpenChange={(v) => !v && setEditJob(null)} />
    </div>
  );
}

function Column({
  status, jobs, sortMode, onSortChange, selectMode, selected, onToggleSelect, onOpen, onEdit, onDelete,
}: {
  status: JobStatus;
  jobs: JobCardData[];
  sortMode: SortMode;
  onSortChange: (m: SortMode) => void;
  selectMode: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onEdit: (job: JobCardData) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors ${isOver ? "border-primary bg-primary/5" : "border-border"}`}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${meta.accent}`} />
          <span className="text-xs font-bold uppercase tracking-wider">{meta.label}</span>
          <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{jobs.length}</span>
        </div>
        <Select value={sortMode} onValueChange={(v) => onSortChange(v as SortMode)}>
          <SelectTrigger className="h-6 w-[88px] px-1.5 text-[10px]" aria-label="Sort column"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="az">A–Z</SelectItem>
            <SelectItem value="za">Z–A</SelectItem>
          </SelectContent>
        </Select>
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
          <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">Drop here</div>
        )}
      </div>
    </div>
  );
}

function SortableCard({
  job, selectMode, selected, onToggleSelect, onOpen, onEdit, onDelete,
}: {
  job: JobCardData;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onEdit: (job: JobCardData) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id, disabled: selectMode });
  const style = { transform: CSS.Transform.toString(transform), transition } as React.CSSProperties;
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
      <Card job={job} selectMode={selectMode} selected={selected} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function Card({
  job, onDelete, onEdit, dragging, selectMode, selected,
}: {
  job: JobCardData;
  onDelete?: (id: string) => void;
  onEdit?: (job: JobCardData) => void;
  dragging?: boolean;
  selectMode?: boolean;
  selected?: boolean;
}) {
  return (
    <div
      className={`group rounded-lg border bg-card p-3 shadow-sm transition-all hover:border-primary/50 hover:shadow-md ${
        selectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
      } ${dragging ? "rotate-2 shadow-xl" : ""} ${selected ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-start gap-2">
        {selectMode && <div data-stop className="pt-0.5"><Checkbox checked={!!selected} /></div>}
        <CompanyLogo company={job.company} domain={job.company_domain} url={job.url} size={26} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight">{job.title}</div>
          <div className="text-xs text-muted-foreground">{job.company}</div>
          {job.location && <div className="truncate text-[11px] text-muted-foreground/80">{job.location}</div>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <ScoreBadge score={job.fit} />
        <FollowUpChip date={job.follow_up_at} status={job.status} />
        <SourceBadge source={job.source} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <AgeChip since={job.applied_at ?? job.created_at} label={job.applied_at ? "Applied" : "Added"} />
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
              onClick={(e) => { e.stopPropagation(); onDelete(job.id); }}
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
