import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock } from "lucide-react";

export function PaywallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Free trial used up</DialogTitle>
          <DialogDescription>
            You've generated documents for the 2 free applications on your account.
            Upgrade to Pro for unlimited tailored resumes and cover letters.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex items-center gap-1.5 font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> Pro plan
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>• Unlimited tailored resumes & cover letters</li>
            <li>• Unlimited AI chat edits on any document</li>
            <li>• Job insights, ATS check & scoring</li>
            <li>• Priority email support</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button asChild onClick={() => onOpenChange(false)}>
            <Link to="/billing">See plans</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function isPaywallError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.includes("PAYMENT_REQUIRED");
}