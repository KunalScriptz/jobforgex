import { useState } from "react";

import type { DiscoverySearch, DiscoveryOptions, SearchInput } from "@/api/discovery";
import { CityAutocomplete } from "@/components/city-autocomplete";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSaveSearch } from "@/hooks/use-discovery";

const NONE = "__none__";

function empty(options: DiscoveryOptions): SearchInput {
  return {
    name: "",
    search_term: "",
    location: "",
    country: null,
    sites: options.sources.filter((s) => !s.india_only && !s.needs_proxy_hint).map((s) => s.name),
    is_remote: false,
    hours_old: 72,
    results_wanted: 30,
    enabled: true,
  };
}

function titleCase(country: string) {
  return country.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Uk$/, "UK").replace(/^Usa$/, "USA");
}

export function SearchFormDialog({
  open,
  onOpenChange,
  options,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: DiscoveryOptions;
  editing: DiscoverySearch | null;
}) {
  // Re-mounted per open (see key in the caller), so the initial state is the form's reset.
  const [form, setForm] = useState<SearchInput>(() => (editing ? { ...editing } : empty(options)));
  const save = useSaveSearch();
  const set = <K extends keyof SearchInput>(key: K, value: SearchInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const needsCountry = form.sites.some((s) => options.sources.find((o) => o.name === s)?.requires_country);
  const missingCountry = needsCountry && !form.country;
  const valid = form.name.trim() && form.search_term.trim().length >= 2 && form.sites.length > 0 && !missingCountry;

  function toggleSite(name: string, checked: boolean) {
    set("sites", checked ? [...form.sites, name] : form.sites.filter((s) => s !== name));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    save.mutate(
      { id: editing?.id, data: { ...form, name: form.name.trim(), search_term: form.search_term.trim(), location: form.location?.trim() || null } },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit search" : "New search"}</DialogTitle>
            <DialogDescription>
              Each search runs on the sources you pick, once a day (or when you press Run now).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="ds-name">Name</Label>
            <Input id="ds-name" value={form.name} maxLength={120} placeholder="Backend roles in Pune" onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ds-term">Job title or keywords</Label>
            <Input id="ds-term" value={form.search_term} maxLength={200} placeholder="backend engineer python" onChange={(e) => set("search_term", e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Location</Label>
              <CityAutocomplete value={form.location ?? ""} onChange={(v) => set("location", v)} placeholder="Pune, or leave empty" />
            </div>
            <div className="space-y-1.5">
              <Label>Country {needsCountry && <span className="text-destructive">*</span>}</Label>
              <Select value={form.country ?? NONE} onValueChange={(v) => set("country", v === NONE ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Select a country" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {options.countries.map((c) => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}
                </SelectContent>
              </Select>
              {missingCountry && <p className="text-xs text-destructive">Indeed and Glassdoor need a country, or they search the USA.</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sources</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.sources.map((s) => (
                <label key={s.name} className="flex items-start gap-2 rounded-md border p-2.5 text-sm">
                  <Checkbox className="mt-0.5" checked={form.sites.includes(s.name)} onCheckedChange={(v) => toggleSite(s.name, v === true)} />
                  <span>
                    <span className="font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.india_only ? "India only" : s.needs_proxy_hint ? "May be rate limited without a proxy" : "Works well"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ds-hours">Posted within</Label>
              <Select value={String(form.hours_old)} onValueChange={(v) => set("hours_old", Number(v))}>
                <SelectTrigger id="ds-hours"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="72">3 days</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                  <SelectItem value="336">14 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-results">Results per source</Label>
              <Select value={String(form.results_wanted)} onValueChange={(v) => set("results_wanted", Number(v))}>
                <SelectTrigger id="ds-results"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[15, 30, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <Checkbox checked={form.is_remote} onCheckedChange={(v) => set("is_remote", v === true)} />
              Remote only
            </label>
          </div>
          {form.is_remote && form.sites.includes("linkedin") && (
            <p className="text-xs text-muted-foreground">LinkedIn ignores the remote filter; the other sources apply it.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? "Saving…" : "Save search"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
