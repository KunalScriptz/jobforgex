import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface TourStep {
  target: string; // data-tour attribute value on the sidebar nav link
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    target: "nav-jobs",
    title: "Jobs board",
    body: "Your pipeline lives here. Add jobs and drag cards across Wishlist → Applied → Interview → Offer. Export everything to Excel anytime.",
  },
  {
    target: "nav-generate",
    title: "Generate documents",
    body: "Pick a saved job, score your fit, and generate a tailored resume and cover letter rewritten around the job description.",
  },
  {
    target: "nav-resumes",
    title: "Resume editor",
    body: "Your base resume in LaTeX with a live PDF preview. Use the outline to jump between sections, or Ask AI to edit it.",
  },
  {
    target: "nav-checker",
    title: "Checker",
    body: "Score your base resume against any job and see keyword gaps before you tailor it.",
  },
  {
    target: "nav-settings",
    title: "Settings",
    body: "Update your profile, location and salary, manage boards, and connect the Chrome extension.",
  },
  {
    target: "nav-whats-new",
    title: "What's New",
    body: "See what we've shipped recently, grouped by month.",
  },
];

interface TourApi {
  start: () => void;
  next: () => void;
  prev: () => void;
  close: () => void;
}

const TourContext = createContext<TourApi | null>(null);

export function useTour(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [stepIndex, setStepIndex] = useState(-1);

  const start = useCallback(() => setStepIndex(0), []);
  const next = useCallback(() => setStepIndex((i) => (i + 1 < STEPS.length ? i + 1 : -1)), []);
  const prev = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);
  const close = useCallback(() => setStepIndex(-1), []);

  const api = useMemo(() => ({ start, next, prev, close }), [start, next, prev, close]);

  return (
    <TourContext.Provider value={api}>
      {children}
      <TourOverlay stepIndex={stepIndex} onNext={next} onPrev={prev} onClose={close} />
    </TourContext.Provider>
  );
}

function TourOverlay({
  stepIndex,
  onNext,
  onPrev,
  onClose,
}: {
  stepIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = stepIndex >= 0 ? STEPS[stepIndex] : null;

  useEffect(() => {
    if (!step) return;
    function update() {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step!.target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [step]);

  if (!step) return null;

  const isLast = stepIndex === STEPS.length - 1;
  const tooltipWidth = 320;
  const left = rect
    ? Math.min(Math.max(8, rect.left + rect.width / 2 - tooltipWidth / 2), Math.max(8, window.innerWidth - tooltipWidth - 8))
    : (window.innerWidth - tooltipWidth) / 2;
  const top = rect
    ? rect.bottom + 12 + tooltipHeight(step) > window.innerHeight
      ? Math.max(8, rect.top - 12 - tooltipHeight(step))
      : rect.bottom + 12
    : window.innerHeight / 2 - 120;

  return (
    <div className="fixed inset-0 z-[100]" aria-modal="true" role="dialog">
      {rect && (
        <div
          className="pointer-events-none absolute rounded-md ring-2 ring-primary"
          style={{
            left: rect.left - 4,
            top: rect.top - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
          }}
        />
      )}
      <div
        className="absolute w-[320px] rounded-lg border bg-card p-4 shadow-xl"
        style={{ left, top }}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {stepIndex + 1} of {STEPS.length}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-1 text-sm font-semibold">{step.title}</div>
        <p className="text-xs text-muted-foreground">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={onPrev} disabled={stepIndex === 0}>
            Back
          </Button>
          <Button size="sm" onClick={onNext}>{isLast ? "Finish" : "Next"}</Button>
        </div>
      </div>
    </div>
  );
}

// Rough height of the tooltip card for vertical clamping (title + 2-line body + controls).
function tooltipHeight(_step: TourStep): number {
  return 160;
}
