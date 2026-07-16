import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { listBoards, createBoard, renameBoard, deleteBoard } from "@/lib/workspace.functions";
import { listExtensionTokens, createExtensionToken, revokeExtensionToken } from "@/lib/extension.functions";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Chrome, Download, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <BoardsCard />
      <ExtensionCard />
    </div>
  );
}

function BoardsCard() {
  const qc = useQueryClient();
  const get = useServerFn(listBoards);
  const add = useServerFn(createBoard);
  const ren = useServerFn(renameBoard);
  const del = useServerFn(deleteBoard);
  const { data: boards = [] } = useQuery({ queryKey: ["boards"], queryFn: () => get() });
  const [name, setName] = useState("");
  return (
    <Card>
      <CardHeader><CardTitle>Boards</CardTitle><CardDescription>Group your jobs by year, focus, or campaign.</CardDescription></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {boards.map((b: any) => (
            <div key={b.id} className="flex items-center gap-2">
              <Input defaultValue={b.name} onBlur={(e) => e.target.value !== b.name && ren({ data: { id: b.id, name: e.target.value } } as any).then(() => qc.invalidateQueries({ queryKey: ["boards"] }))} />
              <Button size="sm" variant="ghost" onClick={() => del({ data: { id: b.id } } as any).then(() => qc.invalidateQueries({ queryKey: ["boards"] }))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input placeholder="New board name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={async () => { if (!name) return; await add({ data: { name } } as any); qc.invalidateQueries({ queryKey: ["boards"] }); setName(""); }}><Plus className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ExtensionCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listExtensionTokens);
  const createFn = useServerFn(createExtensionToken);
  const revokeFn = useServerFn(revokeExtensionToken);
  const { data: tokens = [] } = useQuery({ queryKey: ["ext-tokens"], queryFn: () => listFn() });
  const [freshToken, setFreshToken] = useState<string>("");
  const create = useMutation({
    mutationFn: async () => createFn({ data: { label: "Chrome extension" } } as any),
    onSuccess: (r: any) => { setFreshToken(r.token); qc.invalidateQueries({ queryKey: ["ext-tokens"] }); toast.success("Token generated"); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => revokeFn({ data: { id } } as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ext-tokens"] }); toast.success("Revoked"); },
  });

  async function downloadExtension() {
    try {
      const res = await fetch("/jobforge-extension.zip");
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "jobforge-extension.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Chrome className="h-4 w-4" /> Chrome extension</CardTitle>
        <CardDescription>Save jobs to your board with one click from any job posting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={downloadExtension}><Download className="mr-1.5 h-4 w-4" /> Download extension (.zip)</Button>
          <Button size="sm" variant="outline" onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="mr-1.5 h-4 w-4" /> Generate connect token
          </Button>
        </div>
        {freshToken && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
            <div className="mb-1 font-medium">Copy this token — you won't see it again:</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-auto rounded bg-background px-2 py-1 font-mono text-xs">{freshToken}</code>
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(freshToken); toast.success("Copied"); }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="mb-1 font-semibold text-foreground">Install</div>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>Unzip the downloaded file.</li>
            <li>Open <code>chrome://extensions</code> and enable Developer mode.</li>
            <li>Click Load unpacked and pick the unzipped folder.</li>
            <li>Click the extension icon → Connect → paste your token.</li>
          </ol>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active tokens</div>
          {tokens.length === 0 && <div className="text-xs text-muted-foreground">No tokens yet.</div>}
          {tokens.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between rounded border p-2 text-xs">
              <div><span className="font-mono">{t.token_prefix}…</span> · {t.label} · {new Date(t.created_at).toLocaleDateString()}</div>
              <Button size="sm" variant="ghost" onClick={() => revoke.mutate(t.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
