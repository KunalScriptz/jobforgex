// Central place for user-facing download filenames.

function slug(s: string): string {
  return (s || "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

// Words that show up inside LaTeX formatting/color macros and must never be
// treated as part of a person's name.
const LATEX_NOISE = new Set([
  "color", "textcolor", "definecolor", "small", "large", "huge", "scshape",
  "textbf", "textit", "bfseries", "itshape", "centering", "center",
  "vspace", "hspace", "noindent", "par", "rmfamily", "sffamily",
  "darkturquoise", "black", "white", "blue", "red", "green", "gray", "grey",
]);

function looksLikeHumanName(s: string): boolean {
  const cleaned = s.trim();
  if (!cleaned) return false;
  // Reject anything with LaTeX syntax leftovers.
  if (/[\\{}\[\]$#%&_^~<>=/*+@|`"]/.test(cleaned)) return false;
  if (/\d/.test(cleaned)) return false;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 5) return false;
  for (const t of tokens) {
    if (LATEX_NOISE.has(t.toLowerCase())) return false;
    if (!/^[A-Za-z][A-Za-z.'\-]{0,30}$/.test(t)) return false;
  }
  // Require at least one uppercase letter somewhere — proper names are capitalised.
  if (!/[A-Z]/.test(cleaned)) return false;
  return true;
}

/** Try to pull the candidate's name out of a LaTeX resume. Returns "" if unsure. */
export function extractResumeName(src: string): string {
  const candidates: string[] = [];
  const push = (v: string | undefined) => { if (v) candidates.push(v.trim()); };

  // Strip LaTeX commands (\word, optionally with [..] or {..} args) and
  // brace-groups from a chunk, leaving raw text tokens. Used to peel away
  // things like `\scshape \color{darkturquoise}` from the name region.
  const stripLatex = (chunk: string): string => {
    let prev = "";
    let out = chunk;
    // Remove {...} groups (non-nested is fine — repeat until stable).
    while (out !== prev) {
      prev = out;
      out = out.replace(/\{[^{}]*\}/g, " ");
    }
    // Remove \command (optionally with a single [..] arg).
    out = out.replace(/\\[A-Za-z@]+\*?(?:\[[^\]]*\])?/g, " ");
    // Remove any leftover backslashes, tildes, dollars.
    out = out.replace(/[\\$~^&%#]/g, " ");
    return out.replace(/\s+/g, " ").trim();
  };

  // \textbf{ ... \Huge ... Firstname Lastname ... } — allow the name region
  // to contain nested \color{...}, \scshape, etc. by matching balanced-ish
  // content then stripping LaTeX before picking the human text.
  for (const m of src.matchAll(/\\textbf\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
    const inner = m[1];
    if (!/\\(?:Huge|LARGE|Large)\b/.test(inner)) continue;
    push(stripLatex(inner));
  }
  // \name{...}
  for (const m of src.matchAll(/\\name\s*\{([^{}\\]+)\}/g)) push(m[1]);
  // \Huge Firstname Lastname (no braces)
  for (const m of src.matchAll(/\\(?:Huge|LARGE|Large)\s+([A-Z][A-Za-z.'\- ]{2,60})/g)) push(m[1]);

  for (const c of candidates) {
    if (looksLikeHumanName(c)) return c;
  }
  return "";
}

/** Try to pull a headline / role from the LaTeX (line right under the name, often italics). */
export function extractResumeRole(src: string): string {
  const m = src.match(/\\textit\s*\{([^}]{2,60})\}/);
  if (m) return m[1].trim();
  return "";
}

export type ResumeNameArgs = {
  latex?: string;
  fallbackName?: string;
  role?: string;
  ext: "tex" | "pdf";
};

/** `John_Doe_Base_Resume.tex` — always ends in `_Base_Resume.<ext>`. */
export function baseResumeFilename(a: ResumeNameArgs): string {
  const rawName = a.fallbackName || extractResumeName(a.latex ?? "");
  const name = looksLikeHumanName(rawName) ? slug(rawName) : "";
  const rawRole = a.role || extractResumeRole(a.latex ?? "");
  const role = looksLikeHumanName(rawRole) ? slug(rawRole) : "";
  const parts = [name, role, "Base_Resume"].filter(Boolean);
  const base = parts.join("_") || "Base_Resume";
  return `${base}.${a.ext}`;
}