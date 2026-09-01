import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Wand2, HelpCircle, Chrome, ListTodo, MessageSquare,
  ClipboardCheck, Target, Download,
} from "lucide-react";
import { useTour } from "@/components/tour";

const KEY = "jobforge_onboarding_v1";
const PENDING_KEY = "jobforge_guide_pending";

export function OnboardingGuide() {
  const [open, setOpen] = useState(false);
  const tour = useTour();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(PENDING_KEY) === "1") {
        sessionStorage.removeItem(PENDING_KEY);
        setOpen(true);
      } else if (!localStorage.getItem(KEY)) {
        setOpen(true);
      }
    } catch { /* ignore */ }
  }, []);

  function close() {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  }

  function startTour() {
    close();
    tour.start();
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
        title="How to use JobForge"
      >
        <HelpCircle className="mr-1.5 h-4 w-4" /> Guide
      </Button>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Welcome to JobForge 👋</DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5 text-sm">
            <p className="text-muted-foreground">
              A quick tour so you can go from job post to tailored application in minutes.
            </p>
            <Step
              icon={<ListTodo className="h-4 w-4 text-sky-500" />}
              title="1. Add jobs to the board"
              body="Click Add job (or use the Chrome extension) to save roles. Drag cards across Wishlist → Applied → Interview → Offer to track your pipeline."
            />
            <Step
              icon={<Wand2 className="h-4 w-4 text-amber-500" />}
              title="2. Tailor a resume to a job"
              body="Open any job card → Documents → Generate. You'll get a resume and/or cover letter rewritten around the job description and compiled to PDF."
            />
            <Step
              icon={<Target className="h-4 w-4 text-emerald-500" />}
              title="3. Check your ATS score"
              body="After tailoring, an ATS score appears automatically, showing matched vs missing keywords and how to raise it. Rescore anytime."
            />
            <Step
              icon={<MessageSquare className="h-4 w-4 text-rose-500" />}
              title="4. Ask AI to edit"
              body="In any resume (Resume page or a job document), ask the AI to add, remove, or rewrite content."
            />
            <Step
              icon={<ClipboardCheck className="h-4 w-4 text-teal-500" />}
              title="5. Score & build"
              body="Use Checker to score your base resume vs a job, and Builder to edit it section-by-section with AI suggestions."
            />
            <Step
              icon={<Download className="h-4 w-4 text-indigo-500" />}
              title="6. Export your pipeline"
              body="On the Jobs board, hit Export to download every job (company, title, status, notes, scores & more) as a styled Excel file."
            />
            <Step
              icon={<Chrome className="h-4 w-4 text-orange-500" />}
              title="7. Install the extension (optional)"
              body="Install JobForge Autofill from the Chrome Web Store, then generate a connect token in Settings. Save jobs from LinkedIn, Greenhouse, Lever, Ashby & more in one click."
            />
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" onClick={startTour}>Take the interactive tour</Button>
            <Button onClick={close}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Step({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{body}</div>
      </div>
    </div>
  );
}
