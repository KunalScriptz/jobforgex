// Theme is locked to light. The extra palettes and dark mode caused
// contrast issues in the LaTeX preview, so we render nothing here and
// force a stable light theme on boot.

export function ThemeToggle() {
  return null;
}

// Inline script to remove any leftover dark/palette state from previous
// versions so the app renders in light mode on every load.
export const themeInitScript = `
(function(){try{
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.style.colorScheme='light';
  try { localStorage.removeItem('jobforge-theme'); } catch(e) {}
  try { localStorage.removeItem('jobforge-palette'); } catch(e) {}
}catch(e){}})();
`;