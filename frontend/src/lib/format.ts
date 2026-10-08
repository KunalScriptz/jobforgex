const DAY_MS = 86_400_000;

/** Whole days from today (local) to a YYYY-MM-DD date: negative when it's in the past. */
export function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / DAY_MS);
}

/** Whole days since an ISO timestamp. */
export function ageInDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / DAY_MS));
}

export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  if (ratio === null || ratio === undefined) return "–";
  return `${(ratio * 100).toFixed(digits)}%`;
}
