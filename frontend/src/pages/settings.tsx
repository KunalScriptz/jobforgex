import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { workspaceApi } from "@/api/workspace";
import { extensionApi } from "@/api/extension";
import { authApi } from "@/api/auth";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Plus, Chrome, Download, Copy, AlertTriangle } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <BoardsCard />
      <ExtensionCard />
      <DeleteAccountCard />
    </div>
  );
}

function BoardsCard() {
  const qc = useQueryClient();
  const { data: boards = [] } = useQuery({ queryKey: ["boards"], queryFn: () => workspaceApi.listBoards() });
  const [name, setName] = useState("");
  return (
    <Card>
      <CardHeader><CardTitle>Boards</CardTitle><CardDescription>Group your jobs by year, focus, or campaign.</CardDescription></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {boards.map((b: any) => (
            <div key={b.id} className="flex items-center gap-2">
              <Input defaultValue={b.name} onBlur={(e) => e.target.value !== b.name && workspaceApi.renameBoard(b.id, e.target.value).then(() => qc.invalidateQueries({ queryKey: ["boards"] }))} />
              <Button size="sm" variant="ghost" onClick={() => workspaceApi.deleteBoard(b.id).then(() => qc.invalidateQueries({ queryKey: ["boards"] }))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input placeholder="New board name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={async () => { if (!name) return; await workspaceApi.createBoard(name); qc.invalidateQueries({ queryKey: ["boards"] }); setName(""); }}><Plus className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ExtensionCard() {
  const qc = useQueryClient();
  const { data: tokens = [] } = useQuery({ queryKey: ["ext-tokens"], queryFn: () => extensionApi.listTokens() });
  const [freshToken, setFreshToken] = useState<string>("");
  const create = useMutation({
    mutationFn: async () => extensionApi.createToken("Chrome extension"),
    onSuccess: (r: any) => { setFreshToken(r.token); qc.invalidateQueries({ queryKey: ["ext-tokens"] }); toast.success("Token generated"); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => extensionApi.revokeToken(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ext-tokens"] }); toast.success("Revoked"); },
  });

  async function downloadExtension() {
    try {
      const res = await fetch("/api/v1/extension/download");
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

function DeleteAccountCard() {
  const navigate = useNavigate();
  const del = useMutation({
    mutationFn: () => authApi.deleteAccount(),
    onSuccess: () => {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      toast.success("Account deleted");
      navigate("/");
    },
    onError: (e: any) => toast.error(String(e?.response?.data?.detail || e?.message || "Failed").slice(0, 300)),
  });

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Danger zone
        </CardTitle>
        <CardDescription>
          Permanently delete your account and all associated data — workspaces, jobs, resumes, and generated documents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={del.isPending}>
              {del.isPending ? "Deleting…" : "Delete my account"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This action is permanent and cannot be undone. All your workspaces, boards, jobs, resumes, cover letters, and generated documents will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => del.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Yes, delete everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
