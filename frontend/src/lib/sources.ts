/** Display names for `jobs.source` (see backend services/job_url.py). */
const LABELS: Record<string, string> = {
  manual: "Manual",
  web: "Web",
  linkedin: "LinkedIn",
  indeed: "Indeed",
  glassdoor: "Glassdoor",
  jobstreet: "JobStreet",
  naukri: "Naukri",
  ziprecruiter: "ZipRecruiter",
  wellfound: "Wellfound",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
  workable: "Workable",
  smartrecruiters: "SmartRecruiters",
  weworkremotely: "We Work Remotely",
  remoteok: "RemoteOK",
  monster: "Monster",
  foundit: "foundit",
  hirist: "Hirist",
  seek: "SEEK",
  instahyre: "Instahyre",
  cutshort: "Cutshort",
  bayt: "Bayt",
};

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "Manual";
  return LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}
