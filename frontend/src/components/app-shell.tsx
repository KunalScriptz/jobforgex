import { Link, useLocation, useNavigate } from "react-router-dom";
import { ListTodo, Wand2, FileText, ClipboardCheck, Settings, Sparkles, LogOut, Map } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import logoImg from "@/assets/logo.png";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { useWorkspace } from "@/hooks/use-workspace";
import { useTour } from "@/components/tour";
import { usersApi } from "@/api/users";
import { UserAvatar } from "@/components/user-avatar";

const NAV = [
  { to: "/jobs", label: "Jobs", icon: ListTodo, tour: "nav-jobs" },
  { to: "/generate", label: "Generate", icon: Wand2, tour: "nav-generate" },
  { to: "/resumes", label: "Resume", icon: FileText, tour: "nav-resumes" },
  { to: "/checker", label: "Checker", icon: ClipboardCheck, tour: "nav-checker" },
  { to: "/settings", label: "Settings", icon: Settings, tour: "nav-settings" },
  { to: "/whats-new", label: "What's New", icon: Sparkles, tour: "nav-whats-new" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { logout } = useAuth();
  const { data: ws } = useWorkspace();
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => usersApi.getMe() });
  const tour = useTour();

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
          to="/"
          className="flex h-14 items-center gap-2 border-b px-4 font-semibold transition-colors hover:bg-muted/50"
        >
          <img src={logoImg} alt="JobForge" className="h-5 w-5" />
          JobForge
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {NAV.map(({ to, label, icon: Icon, tour: tourId }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link key={to} to={to} data-tour={tourId} className={cn(
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
          {profile && (
            <div className="mb-2 flex items-center gap-2">
              <UserAvatar fullName={profile.full_name} email={profile.email} avatarPreset={profile.avatar_preset} />
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{profile.full_name || profile.email}</div>
              </div>
            </div>
          )}
          <div className="truncate font-medium">{ws?.name ?? "Workspace"}</div>
          <div className="mt-2 flex flex-col gap-1.5">
            <ThemeToggle />
            <button onClick={tour.start} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <Map className="h-3.5 w-3.5" /> Tour
            </button>
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
