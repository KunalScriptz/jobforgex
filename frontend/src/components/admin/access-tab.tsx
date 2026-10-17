import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Plus, X } from "lucide-react";

import { adminApi, type AdminSettingsUpdate, type SignupMode } from "@/api/admin";
import { apiErrorMessage } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/format";

const MODES: { value: SignupMode; label: string; help: string }[] = [
  { value: "open", label: "Open", help: "Anyone with a Google account can sign up." },
  { value: "invite", label: "Invite only", help: "Only emails on the allowlist below can create an account." },
  { value: "closed", label: "Closed", help: "No new accounts. Existing users keep working." },
];

export function AccessTab() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["admin", "settings"], queryFn: adminApi.settings });
  const { data: allow } = useQuery({ queryKey: ["admin", "allowlist"], queryFn: adminApi.allowlist });
  const [email, setEmail] = useState("");
  const [cap, setCap] = useState("");

  useEffect(() => {
    if (settings) setCap(settings.default_ai_monthly_cap_usd != null ? String(settings.default_ai_monthly_cap_usd) : "");
  }, [settings]);

  const update = useMutation({
    mutationFn: (data: AdminSettingsUpdate) => adminApi.updateSettings(data),
    onSuccess: (fresh) => { qc.setQueryData(["admin", "settings"], fresh); toast.success("Saved"); },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not save")),
  });
  const add = useMutation({
    mutationFn: (e: string) => adminApi.addToAllowlist(e),
    onSuccess: () => { setEmail(""); qc.invalidateQueries({ queryKey: ["admin", "allowlist"] }); },
    onError: (e) => toast.error(apiErrorMessage(e, "Enter a valid email address")),
  });
  const remove = useMutation({
    mutationFn: (e: string) => adminApi.removeFromAllowlist(e),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "allowlist"] }),
    onError: (e) => toast.error(apiErrorMessage(e, "Could not remove")),
  });
  const sendNow = useMutation({
    mutationFn: adminApi.sendSummaryNow,
    onSuccess: (r) => toast.success(`Summary queued for ${r.recipients.join(", ")}`),
    onError: (e) => toast.error(apiErrorMessage(e, "Could not queue the summary")),
  });

  if (!settings) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const capNum = cap.trim() === "" ? null : Number(cap);
  const capInvalid = capNum !== null && (!Number.isFinite(capNum) || capNum < 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who can sign up</CardTitle>
          <CardDescription>Applies to new accounts only. Anyone who already has an account can still sign in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={settings.signup_mode} onValueChange={(v) => update.mutate({ signup_mode: v as SignupMode })}>
            {MODES.map((m) => (
              <div key={m.value} className="flex items-start gap-3">
                <RadioGroupItem value={m.value} id={`mode-${m.value}`} className="mt-1" />
                <Label htmlFor={`mode-${m.value}`} className="space-y-0.5 font-normal">
                  <div className="font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{m.help}</div>
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="allow-email">Allowlist</Label>
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); if (email.trim()) add.mutate(email.trim()); }}
            >
              <Input id="allow-email" type="email" placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button type="submit" disabled={!email.trim() || add.isPending}><Plus className="mr-1 h-4 w-4" />Add</Button>
            </form>
            {settings.signup_mode !== "invite" && (
              <p className="text-xs text-muted-foreground">The allowlist is only used in invite-only mode.</p>
            )}
            <ul className="divide-y rounded-md border text-sm">
              {allow?.items.length === 0 && <li className="p-3 text-muted-foreground">Nobody is invited yet.</li>}
              {allow?.items.map((a) => (
                <li key={a.email} className="flex items-center justify-between gap-2 p-2.5">
                  <span className="truncate">{a.email}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {formatDate(a.created_at)}
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Remove" onClick={() => remove.mutate(a.email)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Default monthly AI cap</CardTitle>
            <CardDescription>
              Per user, in USD, for the calendar month. Blank means unlimited. Override one person from the Users tab. Admins are never capped.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (capInvalid) return;
                update.mutate(capNum === null ? { clear_default_cap: true } : { default_ai_monthly_cap_usd: capNum });
              }}
            >
              <Input inputMode="decimal" placeholder="Unlimited" value={cap} onChange={(e) => setCap(e.target.value)} />
              <Button type="submit" disabled={capInvalid || update.isPending}>Save</Button>
            </form>
            {capInvalid && <p className="text-xs text-destructive">Enter a number of 0 or more.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email notifications</CardTitle>
            <CardDescription>
              Sent only to the admin addresses set in <code>ADMIN_EMAILS</code>: {settings.admin_emails.join(", ") || "none configured"}.
              Counts and timestamps only, never job or resume content. Needs SMTP to be set up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="n-signups" className="space-y-0.5 font-normal">
                <div className="font-medium">Signup alerts</div>
                <div className="text-xs text-muted-foreground">An email the moment someone signs up, or tries to while signups are restricted.</div>
              </Label>
              <Switch id="n-signups" checked={settings.notify_signups} onCheckedChange={(v) => update.mutate({ notify_signups: v })} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="n-daily" className="space-y-0.5 font-normal">
                <div className="font-medium">Daily summary</div>
                <div className="text-xs text-muted-foreground">6 PM IST: new signups, who was active, AI usage, failures and system health.</div>
              </Label>
              <Switch id="n-daily" checked={settings.notify_daily_summary} onCheckedChange={(v) => update.mutate({ notify_daily_summary: v })} />
            </div>
            <Button variant="outline" size="sm" disabled={sendNow.isPending} onClick={() => sendNow.mutate()}>
              <Mail className="mr-1.5 h-4 w-4" />Send me the summary now
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
