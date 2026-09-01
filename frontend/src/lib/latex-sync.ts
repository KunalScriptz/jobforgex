// Map LaTeX source lines to a plain-text view so a PDF text selection can be matched
// back to the corresponding source line(s). Heuristic, not a full TeX parser — good
// enough for a resume's mostly-inline content.

export interface SourceLine {
  line: number; // 1-based
  text: string; // original source line
  plain: string; // normalized, command-stripped plain text
}

const TEXT_FORMAT_CMDS =
  "textbf|textit|underline|emph|texttt|textsc|textup|textnormal|textbf|section\\*?|subsection\\*?|subsubsection\\*?|resumeItem|resumeSubheading|resumeSubItem|name|href";

/**
 * Reduce one LaTeX source line to searchable plain text.
 * - strips `%` comments (not `\%`)
 * - unwraps text-formatting commands (`\textbf{...}` → `...`, `\section{...}` → `...`)
 * - drops remaining control sequences and line breaks
 * - resolves common escapes (`\&`, `\%`, `\_`, `\#`, `\$`)
 * - collapses whitespace
 */
export function normalizeLatex(line: string): string {
  let s = line;

  // Remove comments, but keep `\%` (escaped percent) intact.
  s = s.replace(/(^|[^\\])%.*$/, "$1");

  // Repeatedly unwrap the text-formatting commands to handle one level of nesting.
  for (let pass = 0; pass < 3; pass++) {
    s = s.replace(
      new RegExp(`\\\\(?:${TEXT_FORMAT_CMDS})\\s*\\{([^{}]*)\\}`, "g"),
      "$1",
    );
  }

  // Collapse `\\` (newline) and standalone spacing commands to spaces.
  s = s.replace(/\\\\/g, " ");

  // Drop remaining control sequences (backslash + letters/@/* + optional space).
  s = s.replace(/\\[a-zA-Z@*]+\s*/g, "");

  // Resolve common escapes.
  s = s.replace(/\\&/g, "&").replace(/\\%/g, "%").replace(/\\_/g, "_").replace(/\\#/g, "#").replace(/\\\$/g, "$");

  // Replace residual grouping chars with spaces, then collapse.
  s = s.replace(/[{}[\]]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function latexToPlainLines(src: string): SourceLine[] {
  return src.split("\n").map((text, i) => ({ line: i + 1, text, plain: normalizeLatex(text) }));
}

/**
 * Find the source line(s) whose plain text contains the selected PDF text.
 * Tries the full selection first, then progressively shorter word prefixes so a
 * trailing punctuation/artifact doesn't defeat the match.
 */
export function findMatchingLines(lines: SourceLine[], selectedText: string): number[] {
  const sel = selectedText.replace(/\s+/g, " ").trim().toLowerCase();
  if (sel.length < 2) return [];

  const words = sel.split(" ");
  for (let n = words.length; n >= 1; n--) {
    const query = words.slice(0, n).join(" ");
    if (query.length < 2) continue;
    const matches = lines.filter((l) => l.plain.toLowerCase().includes(query)).map((l) => l.line);
    if (matches.length) return matches;
  }
  return [];
}
