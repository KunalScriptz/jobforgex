import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { workspaceApi } from "@/api/workspace";
import { extensionApi } from "@/api/extension";
import { authApi } from "@/api/auth";
import { usersApi } from "@/api/users";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Plus, Chrome, ExternalLink, Copy, AlertTriangle, Save, User } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { CityAutocomplete } from "@/components/city-autocomplete";
import { AVATAR_PRESETS, presetAvatarSvg } from "@/lib/avatars";

const CURRENCIES = ["INR", "USD", "AED", "EUR", "GBP", "SGD", "MYR", "AUD", "CAD", "SAR", "QAR", "OMR", "JPY", "HKD", "NZD"];

export default function SettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <PageTitle title="Settings" />
      <h1 className="text-2xl font-bold">Settings</h1>
      <ProfileCard />
      <BoardsCard />
      <ExtensionCard />
      <DeleteAccountCard />
    </div>
  );
}

function ProfileCard() {
  const qc = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => usersApi.getMe() });
  const [fullName, setFullName] = useState("");
  const [avatarPreset, setAvatarPreset] = useState<string | null>(null);
  const [salary, setSalary] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [frequency, setFrequency] = useState("annual");
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (profile && !loaded) {
      setFullName(profile.full_name ?? "");
      setAvatarPreset(profile.avatar_preset ?? null);
      setSalary(profile.current_salary != null ? String(profile.current_salary) : "");
      setCurrency(profile.salary_currency ?? "INR");
      setFrequency(profile.salary_frequency ?? "annual");
      setLocation(profile.location ?? "");
      setPhone(profile.phone ?? "");
      setLinkedinUrl(profile.linkedin_url ?? "");
      setPortfolioUrl(profile.portfolio_url ?? "");
      setCurrentTitle(profile.current_title ?? "");
      setCurrentCompany(profile.current_company ?? "");
      setLoaded(true);
    }
  }, [profile, loaded]);

  const save = useMutation({
    mutationFn: async () => {
      const amount = salary.trim() ? Number(salary) : null;
      const valid = amount !== null && Number.isFinite(amount);
      return usersApi.updateMe({
        full_name: fullName.trim() || null,
        avatar_preset: avatarPreset,
        current_salary: valid ? amount : null,
        salary_currency: valid ? currency : null,
        salary_frequency: valid ? frequency : null,
        location: location.trim() || null,
        phone: phone.trim() || null,
        linkedin_url: linkedinUrl.trim() || null,
        portfolio_url: portfolioUrl.trim() || null,
        current_title: currentTitle.trim() || null,
        current_company: currentCompany.trim() || null,
      });
    },
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["me"] }); },
    onError: (e: any) => toast.error(String(e?.response?.data?.detail || e?.message || "Failed").slice(0, 200)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><User className="h-4 w-4" /> Your profile</CardTitle>
        <CardDescription>Your name appears on generated resumes and cover letters. Location and salary help Ask AI tailor compensation and relocation answers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="pf-name">Full name</Label>
          <div className="mt-1">
            <Input
              id="pf-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Revathi Shree"
            />
          </div>
        </div>
        <div>
          <Label>Avatar</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {AVATAR_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setAvatarPreset(p.id)}
                title={p.label}
                className={`relative h-9 w-9 overflow-hidden rounded-full ring-offset-2 ring-offset-background transition ${
                  avatarPreset === p.id ? "ring-2 ring-primary" : "ring-1 ring-border"
                }`}
                dangerouslySetInnerHTML={{ __html: presetAvatarSvg(p) }}
              />
            ))}
            {avatarPreset && (
              <button
                type="button"
                onClick={() => setAvatarPreset(null)}
                className="flex h-9 items-center rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent"
              >
                Use initials instead
              </button>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="pf-loc">Current location</Label>
          <div className="mt-1">
            <CityAutocomplete
              value={location}
              onChange={setLocation}
              placeholder="e.g. Bengaluru, India"
            />
          </div>
        </div>
        <div>
          <Label>Current salary</Label>
          <div className="mt-1 flex gap-2">
            <Input
              type="number"
              min={0}
              step="any"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. 1200000"
              className="flex-1"
            />
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Leave blank if you'd rather not share.</p>
        </div>

        <div className="border-t pt-4">
          <p className="mb-3 text-sm font-medium">Autofill details</p>
          <p className="mb-3 text-xs text-muted-foreground">Used by the Chrome extension to autofill job application forms.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pf-phone">Phone</Label>
              <Input id="pf-phone" className="mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +91 98765 43210" />
            </div>
            <div>
              <Label htmlFor="pf-linkedin">LinkedIn URL</Label>
              <Input id="pf-linkedin" className="mt-1" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." />
            </div>
            <div>
              <Label htmlFor="pf-portfolio">Portfolio / website</Label>
              <Input id="pf-portfolio" className="mt-1" value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label htmlFor="pf-title">Current title</Label>
              <Input id="pf-title" className="mt-1" value={currentTitle} onChange={(e) => setCurrentTitle(e.target.value)} placeholder="e.g. Senior Software Engineer" />
            </div>
            <div>
              <Label htmlFor="pf-company">Current company</Label>
              <Input id="pf-company" className="mt-1" value={currentCompany} onChange={(e) => setCurrentCompany(e.target.value)} placeholder="e.g. Acme Corp" />
            </div>
          </div>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="mr-1.5 h-4 w-4" /> {save.isPending ? "Saving..." : "Save profile"}
        </Button>
      </CardContent>
    </Card>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Chrome className="h-4 w-4" /> Chrome extension</CardTitle>
        <CardDescription>Save jobs to your board with one click from any job posting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <a
              href="https://chromewebstore.google.com/detail/jobforge-autofill/kigpedieokcmgmhhapiminllfkgkmkfo"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-1.5 h-4 w-4" /> Add to Chrome
            </a>
          </Button>
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
            <li>Click <strong>Add to Chrome</strong> to install JobForge Autofill from the Chrome Web Store.</li>
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
