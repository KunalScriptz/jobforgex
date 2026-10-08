import { Bookmark, FileText, Mail, Phone, Briefcase, Trophy, Handshake, ThumbsDown, type LucideIcon } from "lucide-react";

/**
 * Single source of truth for job statuses on the client. The values are the API's
 * (`jobs.status`); "wishlist" is shown to people as "Saved" and "interview" as "Interviewing".
 */
export type JobStatus =
  | "wishlist"
  | "applied"
  | "acknowledged"
  | "screening"
  | "interview"
  | "offer"
  | "negotiating"
  | "rejected";

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  /** text colour for icons / headings */
  accent: string;
  /** soft pill classes (background + text) that read in light and dark mode */
  chip: string;
}

export const STATUS_META: Record<JobStatus, StatusMeta> = {
  wishlist:     { label: "Saved",        icon: Bookmark,   accent: "text-sky-500",     chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  applied:      { label: "Applied",      icon: FileText,   accent: "text-violet-500",  chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  acknowledged: { label: "Acknowledged", icon: Mail,       accent: "text-indigo-500",  chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  screening:    { label: "Screening",    icon: Phone,      accent: "text-cyan-500",    chip: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
  interview:    { label: "Interviewing", icon: Briefcase,  accent: "text-amber-500",   chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  offer:        { label: "Offer",        icon: Trophy,     accent: "text-emerald-500", chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  negotiating:  { label: "Negotiating",  icon: Handshake,  accent: "text-teal-500",    chip: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
  rejected:     { label: "Rejected",     icon: ThumbsDown, accent: "text-rose-500",    chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
};

/** The Tracker's board columns, left to right. Saved jobs live in Discovery, not here. */
export const TRACKER_COLUMNS: JobStatus[] = [
  "applied", "acknowledged", "screening", "interview", "offer", "negotiating", "rejected",
];

export const ALL_STATUSES: JobStatus[] = ["wishlist", ...TRACKER_COLUMNS];

/** Statuses where an application is still alive (the API's LIVE_STATUSES). */
export const LIVE_STATUSES: JobStatus[] = ["applied", "acknowledged", "screening", "interview", "offer", "negotiating"];

export function statusMeta(status: string | null | undefined): StatusMeta {
  return STATUS_META[(status as JobStatus) ?? "wishlist"] ?? STATUS_META.wishlist;
}

export function statusLabel(status: string | null | undefined): string {
  return statusMeta(status).label;
}
