import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  FileText,
  Sparkles,
  ShieldCheck,
  Calculator,
  Settings,
  LogOut,
  Sun,
  Moon,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useWorkspace } from "@/hooks/use-workspace";
import { useTheme } from "next-themes";

const navItems = [
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/resumes", label: "Resumes", icon: FileText },
  { to: "/generate", label: "Generate", icon: Sparkles },
  { to: "/checker", label: "ATS Checker", icon: ShieldCheck },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { data: workspace } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setThemeState] = useState(() => localStorage.getItem("theme") || "light");

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setThemeState(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const handleLogout = async () => {
    await logout();
    navigate("/auth");
  };

  return (
    <div className="flex h-screen">
      <div className="flex h-full w-64 flex-col border-r bg-muted/40">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">JobForge</span>
        </div>
        <div className="flex-1 overflow-auto p-2">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="border-t p-3">
          <div className="mb-2 truncate text-xs text-muted-foreground">
            {workspace?.name || user?.email}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
