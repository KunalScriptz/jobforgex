import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { CompanyLogo } from "@/components/company-logo";

export type CompanySuggestion = { name: string; domain: string; logo?: string };

/** Free Clearbit autocomplete – no key required. */
async function fetchSuggestions(q: string): Promise<CompanySuggestion[]> {
  if (!q || q.length < 2) return [];
  try {
    const r = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`);
    if (!r.ok) return [];
    const arr = (await r.json()) as CompanySuggestion[];
    return Array.isArray(arr) ? arr.slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function CompanyAutocomplete({
  value,
  onChange,
  onPick,
  placeholder,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (s: CompanySuggestion) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [items, setItems] = useState<CompanySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastQuery = useRef("");

  useEffect(() => {
    const q = value.trim();
    lastQuery.current = q;
    if (q.length < 2) { setItems([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetchSuggestions(q);
      if (lastQuery.current === q) { setItems(res); setOpen(res.length > 0); }
      setLoading(false);
    }, 180);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border bg-popover shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>}
          {items.map((s) => (
            <button
              type="button"
              key={`${s.name}-${s.domain}`}
              onClick={() => { onChange(s.name); onPick?.(s); setOpen(false); }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <span className="flex min-w-0 items-center gap-2">
                <CompanyLogo company={s.name} domain={s.domain} size={22} />
                <span className="truncate font-medium">{s.name}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{s.domain}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}