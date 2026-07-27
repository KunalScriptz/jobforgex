// Light / dark theme toggle. Persisted to localStorage as `jobforge-theme`.
// The inline `themeInitScript` runs before hydration so there is no FOUC.

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

const STORAGE_KEY = "jobforge-theme";

function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  if (!mounted) {
    return <div className="h-9 w-9" aria-hidden />;
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-background/60 text-foreground shadow-sm outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Sun
        className={`h-4 w-4 transition-all duration-300 ${
          isDark ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        }`}
      />
      <Moon
        className={`absolute h-4 w-4 transition-all duration-300 ${
          isDark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0"
        }`}
      />
    </button>
  );
}

// Runs pre-hydration to avoid a flash of the wrong theme.
// Falls back to system preference when nothing is stored.
export const themeInitScript = `
(function(){try{
  var stored = null;
  try { stored = localStorage.getItem('jobforge-theme'); } catch(e) {}
  var prefersDark = false;
  try { prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; } catch(e) {}
  var theme = stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light');
  var root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.removeAttribute('data-palette');
  root.style.colorScheme = theme;
  try { localStorage.removeItem('jobforge-palette'); } catch(e) {}
}catch(e){}})();
`;