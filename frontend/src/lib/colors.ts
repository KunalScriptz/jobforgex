// Color helpers shared by the resume templates and the resume builder.
// The LaTeX template stores colors as "r,g,b" (0..1) rgb tuples via
// \definecolor{darkturquoise}/{darkblue}; the UI works in hex.

export function rgbTupleToHex(t: string): string {
  const parts = t.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 3 || parts.some(isNaN)) return "#00a698";
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, "0");
  return `#${to(parts[0])}${to(parts[1])}${to(parts[2])}`;
}

export function hexToRgbTuple(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  return `${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)}`;
}
