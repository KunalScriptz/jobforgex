import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

type SearchFn = (query: string, limit?: number) => string[];

let searchPromise: Promise<SearchFn> | null = null;
function loadSearch(): Promise<SearchFn> {
  if (!searchPromise) {
    searchPromise = import("@/data/cities").then((m) => m.searchCities);
  }
  return searchPromise;
}

export function CityAutocomplete({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [search, setSearch] = useState<SearchFn | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    loadSearch().then((fn) => { if (mounted) setSearch(() => fn); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (!search || q.length < 2) { setItems([]); setOpen(false); return; }
    setItems(search(q));
    setOpen(true);
  }, [value, search]);

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
      {open && items.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border bg-popover shadow-lg">
          {items.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => { onChange(c); setOpen(false); }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <span className="truncate">{c}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
