import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, CalendarCheck, Compass, Wand2, KanbanSquare, Rocket, Settings, FileText,
  ClipboardCheck, CreditCard, Sparkles, LogOut, Map, Menu, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import logoImg from "@/assets/logo.png";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/context/auth-context";
import { useWorkspace } from "@/hooks/use-workspace";
import { useFeatures, useSetup } from "@/hooks/use-overview";
import { useTour } from "@/components/tour";
import { usersApi } from "@/api/users";
import type { Features } from "@/api/overview";
import { UserAvatar } from "@/components/user-avatar";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  tour: string;
  /** hidden unless this feature flag is on for the deployment */
  requires?: keyof Features;
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { to: "/overview", label: "Overview", icon: LayoutDashboard, tour: "nav-overview" },
      { to: "/today", label: "Today", icon: CalendarCheck, tour: "nav-today" },
      { to: "/discovery", label: "Discovery", icon: Compass, tour: "nav-discovery" },
      { to: "/generate", label: "Tailor", icon: Wand2, tour: "nav-generate" },
      { to: "/tracker", label: "Tracker", icon: KanbanSquare, tour: "nav-tracker" },
    ],
  },
  {
    title: "Setup",
    items: [
      { to: "/setup", label: "Setup quest", icon: Rocket, tour: "nav-setup" },
      { to: "/settings", label: "Settings & profile", icon: Settings, tour: "nav-settings" },
    ],
  },
  {
    title: "Tools",
    items: [
      { to: "/resumes", label: "Resume", icon: FileText, tour: "nav-resumes" },
      { to: "/checker", label: "Checker", icon: ClipboardCheck, tour: "nav-checker" },
    ],
  },
];

const FOOTER_LINKS: NavItem[] = [
  { to: "/billing", label: "Billing", icon: CreditCard, tour: "nav-billing" },
  { to: "/whats-new", label: "What's New", icon: Sparkles, tour: "nav-whats-new" },
];

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      data-tour={item.tour}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4", active && "text-sidebar-primary")} />
      {item.label}
    </Link>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { logout } = useAuth();
  const { data: ws } = useWorkspace();
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => usersApi.getMe() });
  const { data: setup } = useSetup();
  const features = useFeatures();
  const tour = useTour();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await logout();
    toast.success("Signed out");
    navigate("/auth", { replace: true });
  }

  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`);
  const setupIncomplete = setup && setup.done < setup.total;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link
        to="/overview"
        onClick={onNavigate}
        className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4 font-semibold text-sidebar-accent-foreground"
      >
        <img src={logoImg} alt="JobForge" className="h-5 w-5" />
        JobForge
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.requires || features[i.requires]);
          if (!items.length) return null;
          return (
            <div key={group.title}>
              <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/45">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink key={item.to} item={item} active={isActive(item.to)} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-3 border-t border-sidebar-border p-3 text-xs">
        {setupIncomplete && (
          <Link
            to="/setup"
            onClick={onNavigate}
            className="block rounded-lg bg-sidebar-accent/70 p-2.5 transition-colors hover:bg-sidebar-accent"
          >
            <div className="flex items-center justify-between font-medium text-sidebar-accent-foreground">
              Finish setup <span className="tabular-nums text-sidebar-primary">{setup.done}/{setup.total}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sidebar-border">
              <div className="h-full rounded-full bg-sidebar-primary" style={{ width: `${(setup.done / setup.total) * 100}%` }} />
            </div>
          </Link>
        )}

        <div className="space-y-0.5">
          {FOOTER_LINKS.map((item) => (
            <NavLink key={item.to} item={item} active={isActive(item.to)} onNavigate={onNavigate} />
          ))}
          <button
            onClick={() => { onNavigate?.(); tour.start(); }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <Map className="h-4 w-4" /> Tour
          </button>
          <div className="px-1 pt-1">
            <ThemeToggle className="border-sidebar-border bg-sidebar-accent/60 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-sidebar-border pt-3">
          {profile && <UserAvatar fullName={profile.full_name} email={profile.email} avatarPreset={profile.avatar_preset} />}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-sidebar-accent-foreground">{profile?.full_name || profile?.email || "Account"}</div>
            <div className="truncate text-sidebar-foreground/55">{ws?.name ?? "Workspace"}</div>
          </div>
          <button
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-sidebar-border md:block">
        <SidebarBody />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur md:hidden">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="rounded-md p-1.5 hover:bg-muted">
            <Menu className="h-5 w-5" />
          </button>
          <img src={logoImg} alt="" className="h-5 w-5" />
          <span className="font-semibold">JobForge</span>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
