import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ListTodo, Wand2, FileText, ClipboardCheck, DollarSign, Settings, Sparkles, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyWorkspace } from "@/lib/workspace.functions";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { to: "/jobs", label: "Jobs", icon: ListTodo },
  { to: "/generate", label: "Generate", icon: Wand2 },
  { to: "/resumes", label: "Resume", icon: FileText },
  { to: "/checker", label: "Checker", icon: ClipboardCheck },
  { to: "/costs", label: "Costs", icon: DollarSign },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getWs = useServerFn(getMyWorkspace);
  const { data: ws } = useQuery({ queryKey: ["ws"], queryFn: () => getWs() });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-card">
        <Link
          to="/jobs"
          className="flex h-14 items-center gap-2 border-b px-4 font-semibold transition-colors hover:bg-muted/50"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          JobForge
        </Link>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link key={to} to={to} className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}>
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3 text-xs">
          <div className="truncate font-medium">{ws?.name ?? "Workspace"}</div>
          <div className="mt-2 flex flex-col gap-1.5">
            <ThemeToggle />
            <button onClick={signOut} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}