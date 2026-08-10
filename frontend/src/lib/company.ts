const JOB_BOARD_HOSTS = new Set([
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "greenhouse.io",
  "lever.co",
  "workable.com",
  "seek.com.au",
  "seek.co.nz",
  "jobstreet.com",
  "jobsdb.com",
  "naukri.com",
  "monster.com",
  "ziprecruiter.com",
  "simplyhired.com",
  "wellfound.com",
  "hired.com",
  "dice.com",
  "careerbuilder.com",
  "angel.co",
]);

/** Guess a company domain from its name string. Last resort only. */
export function guessDomain(company: string): string {
  return company
    .toLowerCase()
    .replace(
      /\b(inc|llc|ltd|corp|corporation|co|company|gmbh|plc|technologies|solutions|services|group)\b\.?/g,
      ""
    )
    .replace(/[^a-z0-9]/g, "") + ".com";
}

/** Extract a clean hostname from a job URL, stripping www. prefix.
 *  Returns null for job-board hosts (their favicon is misleading) and on parse failure. */
export function hostnameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const normalised = url.startsWith("http") ? url : `https://${url}`;
    const hostname = new URL(normalised).hostname.replace(/^www\./, "").toLowerCase();
    // Block known job boards
    if (JOB_BOARD_HOSTS.has(hostname)) return null;
    // Also block subdomains of job boards (e.g. boards.greenhouse.io)
    for (const board of JOB_BOARD_HOSTS) {
      if (hostname.endsWith("." + board)) return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

/** Resolve the best company domain: stored domain > job URL hostname > name guess. */
export function resolveCompanyDomain(input: {
  domain?: string | null;
  url?: string | null;
  company: string;
}): string {
  return input.domain || hostnameFromUrl(input.url) || guessDomain(input.company);
}

/** First one or two initials from a company name, for the initials-chip fallback. */
export function companyInitials(company: string): string {
  return company
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
