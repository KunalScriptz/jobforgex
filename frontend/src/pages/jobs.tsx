import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useJobs, useCreateJob, useUpdateJob, useDeleteJob, useBulkUpdateStatus, useBulkDeleteJobs } from "@/hooks/use-jobs";
import { useBoards, useCreateBoard, useDeleteBoard } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Board, Job, JobStatus } from "@/api/jobs";
import { GripVertical, Plus, Search, Trash2, ExternalLink } from "lucide-react";

const STATUS_COLUMNS: { status: JobStatus; label: string; color: string }[] = [
  { status: "wishlist", label: "Wishlist", color: "bg-slate-200 dark:bg-slate-700" },
  { status: "applied", label: "Applied", color: "bg-blue-200 dark:bg-blue-900" },
  { status: "interview", label: "Interview", color: "bg-amber-200 dark:bg-amber-900" },
  { status: "rejected", label: "Rejected", color: "bg-red-200 dark:bg-red-900" },
  { status: "offer", label: "Offer", color: "bg-green-200 dark:bg-green-900" },
];

export default function JobsPage() {
  const { data: boards = [], isLoading: boardsLoading } = useBoards();
  const { data: jobs = [], isLoading: jobsLoading } = useJobs();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  const bulkUpdateStatus = useBulkUpdateStatus();
  const bulkDelete = useBulkDeleteJobs();
  const createBoard = useCreateBoard();
  const deleteBoard = useDeleteBoard();

  const [boardId, setBoardId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const [newJob, setNewJob] = useState({
    company: "",
    title: "",
    description: "",
    url: "",
    location: "",
  });

  const [newBoardName, setNewBoardName] = useState("");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    if (boards.length > 0 && !boardId) setBoardId(boards[0].id);
  }, [boards, boardId]);

  const board = boards.find((b) => b.id === boardId);
  const boardJobs = jobs.filter((j) => boardId ? j.board_id === boardId : true);

  const filteredJobs = boardJobs.filter((j) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      j.company.toLowerCase().includes(s) ||
      j.title.toLowerCase().includes(s) ||
      (j.location || "").toLowerCase().includes(s)
    );
  });

  function getJobsByStatus(status: JobStatus) {
    return filteredJobs.filter((j) => j.status === status);
  }

  const handleDragStart = (event: DragStartEvent) => {
    const job = jobs.find((j) => j.id === event.active.id);
    setActiveId(event.active.id as string);
    setActiveJob(job || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    setActiveJob(null);

    const { active, over } = event;
    if (!over) return;

    const jobId = active.id as string;
    const overId = over.id as string;

    const overJob = jobs.find((j) => j.id === overId);
    if (overJob && overJob.status) {
      await updateJob.mutateAsync({ id: jobId, status: overJob.status });
      return;
    }

    const targetStatus = overId as JobStatus;
    if (STATUS_COLUMNS.find((c) => c.status === targetStatus)) {
      await updateJob.mutateAsync({ id: jobId, status: targetStatus });
    }
  };

  const handleCreate = async () => {
    if (!boardId || !newJob.company || !newJob.title) return;
    try {
      await createJob.mutateAsync({
        board_id: boardId,
        company: newJob.company,
        title: newJob.title,
        description: newJob.description,
        url: newJob.url || undefined,
        location: newJob.location || undefined,
        status: "wishlist",
      });
      toast.success("Job added");
      setShowNewDialog(false);
      setNewJob({ company: "", title: "", description: "", url: "", location: "" });
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create job");
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredJobs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredJobs.map((j) => j.id)));
    }
  };

  const handleBulkAction = async (action: "delete" | JobStatus) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (action === "delete") {
      await bulkDelete.mutateAsync(ids);
      toast.success(`Deleted ${ids.length} jobs`);
    } else {
      await bulkUpdateStatus.mutateAsync({ ids, status: action });
      toast.success(`Updated ${ids.length} jobs`);
    }
    setSelectedIds(new Set());
  };

  if (boardsLoading || jobsLoading) {
    return <div className="flex h-64 items-center justify-center">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Jobs</h1>
          <Select value={boardId} onValueChange={(v) => setBoardId(v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select board" />
            </SelectTrigger>
            <SelectContent>
              {boards.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 pl-8"
            />
          </div>
          <Button onClick={() => setShowNewDialog(true)} size="sm">
            <Plus className="mr-1 h-4 w-4" /> Add Job
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowNewBoard(true)}>
            <Plus className="mr-1 h-4 w-4" /> Board
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-muted p-2">
          <span className="text-sm">{selectedIds.size} selected</span>
          {STATUS_COLUMNS.map(({ status, label }) => (
            <Button key={status} variant="outline" size="sm" onClick={() => handleBulkAction(status)}>
              Move to {label}
            </Button>
          ))}
          <Button variant="destructive" size="sm" onClick={() => handleBulkAction("delete")}>
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={selectAll}>
            Select all
          </Button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STATUS_COLUMNS.map(({ status, label, color }) => (
            <div
              key={status}
              id={status}
              className={`rounded-lg ${color} p-3 min-h-[200px]`}
            >
              <h3 className="mb-2 font-medium text-sm flex items-center justify-between">
                {label}
                <Badge variant="secondary" className="text-xs">
                  {getJobsByStatus(status).length}
                </Badge>
              </h3>
              <div className="space-y-2">
                {getJobsByStatus(status).map((job) => (
                  <KanbanCard
                    key={job.id}
                    job={job}
                    isSelected={selectedIds.has(job.id)}
                    onSelect={() => toggleSelect(job.id)}
                    onClick={() => setSelectedJob(job)}
                    onDelete={() => {
                      deleteJob.mutate(job.id);
                      toast.success("Job deleted");
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeJob && (
            <div className="rounded-lg border bg-card p-3 shadow-lg opacity-90">
              <div className="font-medium text-sm">{activeJob.company}</div>
              <div className="text-xs text-muted-foreground">{activeJob.title}</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Job</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Company *</Label>
              <Input value={newJob.company} onChange={(e) => setNewJob((p) => ({ ...p, company: e.target.value }))} maxLength={200} />
            </div>
            <div>
              <Label>Title *</Label>
              <Input value={newJob.title} onChange={(e) => setNewJob((p) => ({ ...p, title: e.target.value }))} maxLength={200} />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={newJob.location} onChange={(e) => setNewJob((p) => ({ ...p, location: e.target.value }))} maxLength={200} />
            </div>
            <div>
              <Label>URL</Label>
              <Input value={newJob.url} onChange={(e) => setNewJob((p) => ({ ...p, url: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={newJob.description} onChange={(e) => setNewJob((p) => ({ ...p, description: e.target.value }))} rows={4} />
            </div>
            <Button onClick={handleCreate} disabled={createJob.isPending} className="w-full">
              {createJob.isPending ? "Creating..." : "Add Job"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewBoard} onOpenChange={setShowNewBoard}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Board</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} placeholder="Board name" maxLength={80} />
            <Button
              onClick={async () => {
                if (!newBoardName) return;
                await createBoard.mutateAsync(newBoardName);
                setShowNewBoard(false);
                setNewBoardName("");
              }}
              className="w-full"
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedJob} onOpenChange={(o) => !o && setSelectedJob(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedJob?.company} — {selectedJob?.title}</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-3">
              {selectedJob.location && <p className="text-sm text-muted-foreground">Location: {selectedJob.location}</p>}
              {selectedJob.url && (
                <a href={selectedJob.url} target="_blank" rel="noreferrer" className="text-sm text-primary flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Job posting
                </a>
              )}
              {selectedJob.description && (
                <div className="text-sm text-muted-foreground max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {selectedJob.description.slice(0, 1000)}
                </div>
              )}
              {selectedJob.notes && (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <strong>Notes:</strong> <span className="whitespace-pre-wrap">{selectedJob.notes}</span>
                </div>
              )}
              <Select
                value={selectedJob.status}
                onValueChange={(v) => {
                  updateJob.mutate({ id: selectedJob.id, status: v as JobStatus });
                  setSelectedJob((prev) => prev ? { ...prev, status: v as JobStatus } : null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_COLUMNS.map(({ status, label }) => (
                    <SelectItem key={status} value={status}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KanbanCard({
  job,
  isSelected,
  onSelect,
  onClick,
  onDelete,
}: {
  job: Job;
  isSelected: boolean;
  onSelect: () => void;
  onClick: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
    data: { type: "job", job },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-card p-3 shadow-sm cursor-pointer hover:border-primary/50 transition-colors ${
        isSelected ? "border-primary" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <Checkbox checked={isSelected} onCheckedChange={onSelect} className="mt-0.5" />
        <div className="flex-1 min-w-0" onClick={onClick}>
          <div className="font-medium text-sm truncate">{job.company}</div>
          <div className="text-xs text-muted-foreground truncate">{job.title}</div>
          {job.location && <div className="text-xs text-muted-foreground mt-0.5">{job.location}</div>}
        </div>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
