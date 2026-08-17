import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock } from "lucide-react";

export interface PaywallInfo {
  message?: string;
  currentPlan?: string;
  limit?: number | null;
  used?: number;
}

export function PaywallDialog({
  open,
  onOpenChange,
  info,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  info?: PaywallInfo | null;
}) {
  const title = info?.currentPlan ? `${info.currentPlan} plan limit reached` : "Free trial used up";
  const description =
    info?.message ??
    "You've generated documents for the 2 free applications on your account. Upgrade for unlimited tailored resumes and cover letters.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
            {typeof info?.limit === "number" && typeof info?.used === "number" && (
              <span className="mt-1 block font-medium text-foreground">
                {info.used} / {info.limit} used this period
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex items-center gap-1.5 font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> Upgrade for more
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>• More job tracks & cover letters per month</li>
            <li>• Structured resume builder</li>
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
  const status = (err as any)?.response?.status;
  const reason = (err as any)?.response?.data?.reason ?? (err as any)?.response?.data?.detail?.reason;
  return status === 403 && reason === "PLAN_LIMIT_REACHED";
}

export function extractPaywallInfo(err: unknown): PaywallInfo | null {
  const data = (err as any)?.response?.data;
  const detail = data?.detail ?? data;
  if (!detail || typeof detail !== "object") return null;
  return {
    message: detail.message,
    currentPlan: detail.currentPlan,
    limit: detail.limit ?? null,
    used: detail.used,
  };
}