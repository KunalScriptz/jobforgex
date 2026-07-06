import { useEffect, useState } from "react";
import { Moon, Sun, Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Theme = "light" | "dark";
const KEY = "jobforge-theme";
const PALETTE_KEY = "jobforge-palette";

export const PALETTES = [
  { id: "mint",   label: "Neon Mint", swatch: "#2dd4a8" },
  { id: "violet", label: "Violet",    swatch: "#a78bfa" },
  { id: "sunset", label: "Sunset",    swatch: "#fb923c" },
  { id: "ocean",  label: "Ocean",     swatch: "#38bdf8" },
  { id: "rose",   label: "Rose",      swatch: "#fb7185" },
  { id: "amber",  label: "Amber",     swatch: "#fbbf24" },
  { id: "slate",  label: "Slate",     swatch: "#94a3b8" },
] as const;
type PaletteId = typeof PALETTES[number]["id"];

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function applyPalette(p: PaletteId) {
  const root = document.documentElement;
  if (p === "mint") root.removeAttribute("data-palette");
  else root.setAttribute("data-palette", p);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [palette, setPalette] = useState<PaletteId>("mint");

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Theme | null) ?? undefined;
    const initial: Theme = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    apply(initial);
    const p = (localStorage.getItem(PALETTE_KEY) as PaletteId | null) ?? "mint";
    setPalette(p);
    applyPalette(p);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(KEY, next);
    apply(next);
  }

  function pick(p: PaletteId) {
    setPalette(p);
    localStorage.setItem(PALETTE_KEY, p);
    applyPalette(p);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggle}
        aria-label="Toggle theme"
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
      >
        {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        {theme === "dark" ? "Light" : "Dark"}
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            aria-label="Change palette"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Palette className="h-3.5 w-3.5" />
            Theme
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2">
          <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Color palette
          </div>
          <div className="grid grid-cols-1 gap-0.5">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${palette === p.id ? "bg-muted font-medium" : ""}`}
              >
                <span className="h-3.5 w-3.5 rounded-full border border-border" style={{ background: p.swatch }} />
                {p.label}
                {palette === p.id && <span className="ml-auto text-[10px] text-primary">●</span>}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Inline script string injected into <head> to avoid a flash of light theme
// before hydration. Runs before React paints.
export const themeInitScript = `
(function(){try{
  var s=localStorage.getItem('${KEY}');
  var d = s ? s==='dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}
  else{document.documentElement.style.colorScheme='light';}
  var p=localStorage.getItem('${PALETTE_KEY}');
  if(p && p!=='mint'){document.documentElement.setAttribute('data-palette',p);}
}catch(e){}})();
`;