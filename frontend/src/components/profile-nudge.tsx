import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { X, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usersApi } from "@/api/users";

const KEY = "jobforgex:profileNudge:v1";

export function ProfileNudge() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });

  const { data } = useQuery({ queryKey: ["me"], queryFn: () => usersApi.getMe(), staleTime: 60_000 });

  if (dismissed || !data || data.profile_complete) return null;

  function dismiss() {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4 shrink-0 text-primary" />
        <span>Add your location and salary so Ask AI can tailor compensation and relocation answers.</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" asChild>
          <Link to="/settings">Complete profile</Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Dismiss">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
