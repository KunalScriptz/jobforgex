import { useState, useMemo } from "react";

function guessDomain(company: string): string {
  return company.toLowerCase().replace(/\b(inc|llc|ltd|corp|corporation|co|company|gmbh|plc|technologies|solutions|services|group)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "") + ".com";
}

function initials(company: string): string {
  return company.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Company logo with graceful fallbacks: Clearbit → Google favicon → initials chip. */
export function CompanyLogo({ company, size = 24, className = "" }: { company: string; size?: number; className?: string }) {
  const domain = useMemo(() => guessDomain(company || ""), [company]);
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const px = `${size}px`;

  if (!company) return null;

  if (stage === 2) {
    return (
      <div
        style={{ width: px, height: px, fontSize: Math.round(size * 0.42) }}
        className={`flex shrink-0 items-center justify-center rounded-md bg-muted font-semibold text-muted-foreground ${className}`}
        aria-label={company}
      >
        {initials(company)}
      </div>
    );
  }

  const src =
    stage === 0
      ? `https://logo.clearbit.com/${domain}`
      : `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  return (
    <img
      src={src}
      alt={`${company} logo`}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setStage((s) => (s + 1) as 0 | 1 | 2)}
      className={`shrink-0 rounded-md bg-white object-contain p-0.5 ring-1 ring-border ${className}`}
      style={{ width: px, height: px }}
    />
  );
}