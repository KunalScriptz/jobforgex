import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { getMyWorkspace } from "@/lib/workspace.functions";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // gate onboarding
    if (location.pathname !== "/onboarding") {
      try {
        const ws = await getMyWorkspace();
        if (!ws || !ws.onboarding_complete) throw redirect({ to: "/onboarding" });
      } catch (e: any) {
        if (e?.isRedirect) throw e;
        // if we can't check, still allow — will error inside
      }
    }
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}