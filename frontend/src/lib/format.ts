const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * One date format for the whole UI, e.g. "Sep 25, 2026".
 *
 * Accepts a date-only string from the API ("2026-09-25", read as that calendar day so a timezone
 * can't shift it) or a full ISO timestamp ("2026-09-25T10:00:00Z", shown in the viewer's timezone).
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = DATE_ONLY.exec(value);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Same format as formatDate, plus the viewer-local time: "Sep 25, 2026, 10:00 AM". */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${formatDate(value)}, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}
