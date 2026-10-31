import { useEffect, useState } from "react";
import { Check, ExternalLink, Play, X } from "lucide-react";

import type { DiscoveredJob, DiscoveredState } from "@/api/discovery";
import { SourceBadge, sourceLabel } from "@/components/discovery/source-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useDiscoveredJobs, useDiscoveryOptions, useDiscoverySearches, useDiscoveryStatus, useRunDiscovery, useTriage,
} from "@/hooks/use-discovery";
import { formatDate, formatDateTime } from "@/lib/format";

const PAGE = 25;
const ALL = "__all__";

function FitBadge({ job }: { job: DiscoveredJob }) {
  const ai = job.fit_score !== null;
  const score = ai ? job.fit_score! : job.keyword_score;
  const tone = score >= 75 ? "bg-emerald-600 text-white" : score >= 50 ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}
      title={ai ? `AI fit: ${job.fit_reason ?? ""}` : "Keyword match (AI score pending)"}
    >
      {score}% {ai ? "fit" : "match"}
    </span>
  );
}

function JobRow({
  job, selected, onSelect, onTriage, busy,
}: {
  job: DiscoveredJob; selected: boolean; busy: boolean;
  onSelect: (checked: boolean) => void; onTriage: (action: "add" | "dismiss") => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardContent className="flex gap-3 p-4">
        {job.state === "new" && <Checkbox className="mt-1" checked={selected} onCheckedChange={(v) => onSelect(v === true)} aria-label={`Select ${job.title}`} />}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
              {job.title} <ExternalLink className="mb-0.5 inline h-3 w-3 text-muted-foreground" />
            </a>
            <FitBadge job={job} />
            {job.possible_duplicate && <Badge variant="secondary" title="The same role was already seen on another board or in your jobs">Possible duplicate</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {[job.company, job.location, job.salary_text].filter(Boolean).join(" · ")}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <SourceBadge source={job.source} />
            {job.date_posted && <span>Posted {formatDate(job.date_posted)}</span>}
            {job.is_remote && <span>Remote</span>}
            {job.fit_reason && <span className="italic">“{job.fit_reason}”</span>}
          </div>
          {job.description && (
            <div>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setOpen((o) => !o)}>
                {open ? "Hide description" : "Show description"}
              </button>
              {open && (
                <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs">
                  {job.description}
                </div>
              )}
            </div>
          )}
        </div>
        {job.state === "new" ? (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button size="sm" disabled={busy} onClick={() => onTriage("add")}><Check /> Add</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onTriage("dismiss")}><X /> Dismiss</Button>
          </div>
        ) : (
          <Badge variant="secondary" className="h-fit shrink-0">{job.state === "added" ? "On your board" : "Dismissed"}</Badge>
        )}
      </CardContent>
    </Card>
  );
}

export function InboxTab({ onGoToSearches }: { onGoToSearches: () => void }) {
  const [state, setState] = useState<DiscoveredState>("new");
  const [source, setSource] = useState(ALL);
  const [minFit, setMinFit] = useState(ALL);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { setPage(0); setSelected(new Set()); }, [state, source, minFit, debouncedQ]);

  const { data: options } = useDiscoveryOptions();
  const { data: status } = useDiscoveryStatus();
  const { data: searches } = useDiscoverySearches();
  const { data, isLoading, isError } = useDiscoveredJobs({
    state,
    source: source === ALL ? undefined : source,
    min_fit: minFit === ALL ? undefined : Number(minFit),
    q: debouncedQ || undefined,
    limit: PAGE,
    offset: page * PAGE,
  });
  const triage = useTriage();
  const run = useRunDiscovery();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasSearch = (searches?.length ?? 0) > 0;
  const allSelected = items.length > 0 && items.every((j) => selected.has(j.id));

  function act(ids: string[], action: "add" | "dismiss") {
    triage.mutate({ ids, action }, { onSuccess: () => setSelected(new Set()) });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {status?.last_run_at ? `Last run ${formatDateTime(status.last_run_at)}` : "No run yet"}
          {status && status.ai_scored_pending > 0 && ` · ${status.ai_scored_pending} waiting for an AI score`}
        </div>
        <Button size="sm" onClick={() => run.mutate()} disabled={!hasSearch || run.isPending}>
          <Play /> {run.isPending ? "Starting…" : "Run now"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5 text-sm">
          {(["new", "added", "dismissed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setState(s)}
              className={`rounded px-3 py-1 capitalize ${state === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {s === "new" ? `New${status ? ` (${status.new_count})` : ""}` : s === "added" ? "Added" : "Dismissed"}
            </button>
          ))}
        </div>
        <Input className="h-9 w-48" placeholder="Search title or company" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sources</SelectItem>
            {options?.sources.map((s) => <SelectItem key={s.name} value={s.name}>{sourceLabel(s.name)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={minFit} onValueChange={setMinFit}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any fit</SelectItem>
            <SelectItem value="50">50%+</SelectItem>
            <SelectItem value="70">70%+</SelectItem>
            <SelectItem value="85">85%+</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state === "new" && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => setSelected(v === true ? new Set(items.map((j) => j.id)) : new Set())}
              aria-label="Select all on this page"
            />
            Select page
          </label>
          {selected.size > 0 && (
            <>
              <span className="text-muted-foreground">{selected.size} selected</span>
              <Button size="sm" disabled={triage.isPending} onClick={() => act([...selected], "add")}><Check /> Add to board</Button>
              <Button size="sm" variant="outline" disabled={triage.isPending} onClick={() => act([...selected], "dismiss")}><X /> Dismiss</Button>
            </>
          )}
        </div>
      )}

      {isError && <p className="text-sm text-destructive">Could not load discovered jobs.</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !isError && items.length === 0 && (
        <Card>
          <CardContent className="space-y-3 p-8 text-center text-sm text-muted-foreground">
            {!hasSearch ? (
              <>
                <p>Discovery finds new postings for you each day. Start by saving a search.</p>
                <Button size="sm" onClick={onGoToSearches}>Create a search</Button>
              </>
            ) : state === "new" ? (
              <p>Nothing new right now. Press Run now to look again, or check back after the next daily run.</p>
            ) : (
              <p>Nothing here yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            busy={triage.isPending}
            selected={selected.has(job.id)}
            onSelect={(checked) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (checked) next.add(job.id); else next.delete(job.id);
                return next;
              })
            }
            onTriage={(action) => act([job.id], action)}
          />
        ))}
      </div>

      {total > PAGE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
