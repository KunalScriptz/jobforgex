import type { ReactNode } from "react";
import type { JobCard } from "@/api/jobs";
import { CompanyLogo } from "@/components/company-logo";
import { AgeChip, FollowUpChip, ScoreBadge, SourceBadge } from "@/components/shared/chips";
import { Badge } from "@/components/ui/badge";

/** One job as a list row: logo, title/company/location, chips, and caller-supplied actions. */
export function JobRow({ job, onOpen, actions }: { job: JobCard; onOpen?: (id: string) => void; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-sm">
      <button
        type="button"
        onClick={() => onOpen?.(job.id)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <CompanyLogo company={job.company} domain={job.company_domain} url={job.url} size={32} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{job.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {job.company}{job.location ? ` · ${job.location}` : ""}
          </div>
        </div>
      </button>
      <div className="flex flex-wrap items-center gap-1">
        <ScoreBadge score={job.fit} />
        {job.tailored_at && <Badge variant="secondary" className="text-[10px]">Tailored</Badge>}
        <FollowUpChip date={job.follow_up_at} status={job.status} />
        <SourceBadge source={job.source} />
        <AgeChip since={job.created_at} label="Added" />
      </div>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}
