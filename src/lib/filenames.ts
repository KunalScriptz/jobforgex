// Central place for user-facing download filenames.

function slug(s: string): string {
  return (s || "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Try to pull the candidate's name out of a Jake-Gutierrez-style LaTeX resume. */
export function extractResumeName(src: string): string {
  const m1 = src.match(/\\textbf\s*\{\s*\\Huge\s+\\scshape\s+([^}]+)\}/);
  if (m1) return m1[1].trim();
  const m2 = src.match(/\\name\s*\{([^}]+)\}/);
  if (m2) return m2[1].trim();
  const m3 = src.match(/\\(?:Huge|LARGE)\s+\\?([A-Za-z][A-Za-z .'-]{2,})/);
  if (m3) return m3[1].trim();
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
  const name = slug(a.fallbackName || extractResumeName(a.latex ?? ""));
  const role = slug(a.role || extractResumeRole(a.latex ?? ""));
  const parts = [name, role, "Base_Resume"].filter(Boolean);
  const base = parts.join("_") || "Base_Resume";
  return `${base}.${a.ext}`;
}