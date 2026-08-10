import { useState, useMemo, useEffect } from "react";
import { resolveCompanyDomain, companyInitials } from "@/lib/company";

/** Company logo with graceful fallbacks: Google favicon → DuckDuckGo favicon → initials chip. */
export function CompanyLogo({
  company,
  domain,
  url,
  size = 24,
  className = "",
}: {
  company: string;
  domain?: string | null;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const resolved = useMemo(
    () => resolveCompanyDomain({ domain, url, company: company || "" }),
    [domain, url, company]
  );
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  // Reset the fallback chain when the resolved domain changes
  useEffect(() => setStage(0), [resolved]);

  if (!company) return null;

  if (stage === 2) {
    return (
      <div
        style={{ width: `${size}px`, height: `${size}px`, fontSize: Math.round(size * 0.42) }}
        className={`flex shrink-0 items-center justify-center rounded-md bg-muted font-semibold text-muted-foreground ${className}`}
        aria-label={company}
      >
        {companyInitials(company)}
      </div>
    );
  }

  const src =
    stage === 0
      ? `https://www.google.com/s2/favicons?domain=${resolved}&sz=64`
      : `https://icons.duckduckgo.com/ip3/${resolved}.ico`;

  const px = `${size}px`;

  return (
    <img
      src={src}
      alt={`${company} logo`}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setStage((s) => (s + 1) as 0 | 1 | 2)}
      onLoad={(e) => {
        // Broken images that return 200 with zero dimensions never fire onError
        if (e.currentTarget.naturalWidth === 0 || e.currentTarget.naturalHeight === 0) {
          setStage((s) => (s + 1) as 0 | 1 | 2);
        }
      }}
      className={`shrink-0 rounded-md bg-white object-contain p-0.5 ring-1 ring-border ${className}`}
      style={{ width: px, height: px }}
    />
  );
}
