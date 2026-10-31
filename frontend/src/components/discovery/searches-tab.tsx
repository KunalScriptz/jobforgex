import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import type { DiscoverySearch } from "@/api/discovery";
import { SearchFormDialog } from "@/components/discovery/search-form";
import { sourceLabel } from "@/components/discovery/source-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  useDeleteSearch, useDiscoveryOptions, useDiscoverySearches, useDiscoveryStatus,
  useSetDiscoveryEnabled, useToggleSearch,
} from "@/hooks/use-discovery";
import { formatDateTime } from "@/lib/format";

function RunSummary({ search }: { search: DiscoverySearch }) {
  if (!search.last_run_at) return <span className="text-xs text-muted-foreground">Not run yet</span>;
  const tone = search.last_status === "ok" ? "text-emerald-600" : search.last_status === "partial" ? "text-amber-600" : "text-destructive";
  return (
    <div className="space-y-1 text-xs">
      <div className="text-muted-foreground">
        Last run {formatDateTime(search.last_run_at)} ·{" "}
        <span className={tone}>{search.last_status === "ok" ? "all sources worked" : search.last_status === "partial" ? "some sources failed" : "failed"}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(search.last_result ?? {}).map(([name, r]) => (
          <Badge key={name} variant={r.ok ? "secondary" : "destructive"} title={r.error ?? undefined} className="font-normal">
            {sourceLabel(name)}: {r.ok ? `${r.new ?? 0} new of ${r.found ?? 0}` : "failed"}
          </Badge>
        ))}
      </div>
      {search.last_error && <p className="line-clamp-2 text-muted-foreground" title={search.last_error}>{search.last_error}</p>}
    </div>
  );
}

export function SearchesTab() {
  const { data: options } = useDiscoveryOptions();
  const { data: searches, isLoading, isError } = useDiscoverySearches();
  const { data: status } = useDiscoveryStatus();
  const toggleSearch = useToggleSearch();
  const deleteSearch = useDeleteSearch();
  const setEnabled = useSetDiscoveryEnabled();
  const [formKey, setFormKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DiscoverySearch | null>(null);
  const [toDelete, setToDelete] = useState<DiscoverySearch | null>(null);

  const atLimit = options ? (searches?.length ?? 0) >= options.max_searches : false;

  function openForm(search: DiscoverySearch | null) {
    setEditing(search);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-start justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium">Run my searches every day</p>
            <p className="text-xs text-muted-foreground">
              Fresh postings are collected in the morning (around 8 AM IST) and wait in your inbox. You can always press Run now.
            </p>
          </div>
          <Switch
            aria-label="Run my searches every day"
            checked={status?.enabled ?? false}
            disabled={!status || setEnabled.isPending}
            onCheckedChange={(v) => setEnabled.mutate(v)}
          />
        </CardContent>
      </Card>

      {status && !status.proxy_configured && (
        <Alert>
          <AlertDescription className="text-xs">
            No proxy is configured on this server. Indeed and Naukri work fine; LinkedIn and Glassdoor often block server IPs and may return nothing or fail.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Saved searches</h2>
        <Button size="sm" onClick={() => openForm(null)} disabled={!options || atLimit}>
          <Plus /> New search
        </Button>
      </div>
      {atLimit && <p className="text-xs text-muted-foreground">You have reached the limit of {options?.max_searches} saved searches.</p>}

      {isError && <p className="text-sm text-destructive">Could not load your searches.</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {searches?.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          No searches yet. Add one (a job title, a place, and the sites to look on) and Discovery will start filling your inbox.
        </CardContent></Card>
      )}

      {searches?.map((s) => (
        <Card key={s.id}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.name}</span>
                {!s.enabled && <Badge variant="secondary">Paused</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                “{s.search_term}”{s.location ? ` in ${s.location}` : ""}{s.country ? ` (${s.country})` : ""}
                {s.is_remote ? " · remote" : ""} · last {s.hours_old >= 48 ? `${Math.round(s.hours_old / 24)} days` : `${s.hours_old} hours`} · {s.sites.map(sourceLabel).join(", ")}
              </p>
              <RunSummary search={s} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Switch
                aria-label={`Enable ${s.name}`}
                checked={s.enabled}
                onCheckedChange={(v) => toggleSearch.mutate({ id: s.id, enabled: v })}
              />
              <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} onClick={() => openForm(s)}><Pencil /></Button>
              <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => setToDelete(s)}><Trash2 /></Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {options && <SearchFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} options={options} editing={editing} />}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Jobs already in your inbox stay. This search just stops running.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (toDelete) deleteSearch.mutate(toDelete.id); setToDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
