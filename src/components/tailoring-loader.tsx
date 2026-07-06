import { useEffect, useState } from "react";

const STEPS = [
  "Extracting job responsibilities…",
  "Analyzing required keywords…",
  "Matching your experience…",
  "Rewriting bullets for impact…",
  "Optimizing for ATS…",
  "Formatting your resume…",
  "Finalizing document…",
];

type Props = {
  title?: string;
  kind?: "resume" | "cover_letter" | "both";
  /** Approximate total time in seconds, used to pace the progress bar and messages. */
  estimatedSeconds?: number;
};

export function TailoringLoader({ title, kind = "resume", estimatedSeconds = 45 }: Props) {
  const heading =
    title ??
    (kind === "cover_letter"
      ? "Writing your cover letter…"
      : kind === "both"
        ? "Creating your tailored documents…"
        : "Creating your job tailored resume…");

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - start) / 1000), 200);
    return () => clearInterval(id);
  }, []);

  // Progress caps at ~95% until the parent unmounts this loader on completion.
  const rawPct = (elapsed / estimatedSeconds) * 100;
  const pct = Math.min(95, rawPct);
  const stepIdx = Math.min(STEPS.length - 1, Math.floor((pct / 100) * STEPS.length));
  const remaining = Math.max(1, Math.ceil(estimatedSeconds - elapsed));

  const BARS = 50;
  const filled = Math.round((pct / 100) * BARS);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-10 text-center">
      <h2 className="text-2xl font-bold leading-tight">{heading}</h2>
      <p className="italic text-muted-foreground">{STEPS[stepIdx]}</p>

      <div
        className="flex items-center gap-[2px]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        {Array.from({ length: BARS }).map((_, i) => (
          <span
            key={i}
            className={`h-6 w-[3px] rounded-sm transition-colors ${
              i < filled ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <p className="max-w-sm text-sm text-muted-foreground">
        Please stay on this page while we prepare everything for you. Time remaining ~{remaining} seconds.
      </p>
    </div>
  );
}