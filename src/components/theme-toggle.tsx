import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const KEY = "jobforge-theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Theme | null) ?? undefined;
    const initial: Theme = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    apply(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(KEY, next);
    apply(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
    >
      {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
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
}catch(e){}})();
`;