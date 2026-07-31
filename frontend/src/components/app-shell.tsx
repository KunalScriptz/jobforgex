import { Link, useLocation, useNavigate } from "react-router-dom";
import { ListTodo, Wand2, FileText, ClipboardCheck, CreditCard, Settings, Sparkles, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import logoImg from "@/assets/logo.png";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { useWorkspace } from "@/hooks/use-workspace";

const NAV = [
  { to: "/jobs", label: "Jobs", icon: ListTodo },
  { to: "/generate", label: "Generate", icon: Wand2 },
  { to: "/resumes", label: "Resume", icon: FileText },
  { to: "/checker", label: "Checker", icon: ClipboardCheck },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { logout } = useAuth();
  const { data: ws } = useWorkspace();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await logout();
    toast.success("Signed out");
    navigate("/auth", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r bg-card">
        <Link
          to="/jobs"
          className="flex h-14 items-center gap-2 border-b px-4 font-semibold transition-colors hover:bg-muted/50"
        >
          <img src={logoImg} alt="JobForge" className="h-5 w-5" />
          JobForge
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
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
