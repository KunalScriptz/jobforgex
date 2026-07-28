import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, FileText, Wand2, HelpCircle, Chrome } from "lucide-react";

const KEY = "jobforge_onboarding_v1";

export function OnboardingGuide() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch { /* ignore */ }
  }, []);

  function close() {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Welcome to JobForge 👋</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              A quick tour so you can start applying faster.
            </p>
            <Step
              icon={<FileText className="h-4 w-4 text-violet-500" />}
              title="1. Upload your base resume"
              body="Head to Resume in the sidebar and paste or upload your LaTeX resume. This becomes the source for every tailored version."
            />
            <Step
              icon={<Sparkles className="h-4 w-4 text-sky-500" />}
              title="2. Add jobs to the board"
              body="Click Add job (or use the Chrome extension in Settings) to save roles you're interested in. Drag cards across Wishlist → Applied → Interview → Offer."
            />
            <Step
              icon={<Wand2 className="h-4 w-4 text-amber-500" />}
              title="3. Generate tailored docs"
              body="Open any job card → Documents → Generate. You'll get a tailored resume and/or cover letter compiled to PDF."
            />
            <Step
              icon={<Chrome className="h-4 w-4 text-emerald-500" />}
              title="4. Install the extension (optional)"
              body="Settings → Chrome extension. Save jobs from LinkedIn, Greenhouse, Lever, Ashby & more in one click."
            />
          </div>
          <DialogFooter>
            <Button onClick={close}>Got it — let's go</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Step({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{body}</div>
      </div>
    </div>
  );
}