import { useSearchParams } from "react-router-dom";

import { useAuth } from "@/context/auth-context";
import { PageTitle } from "@/components/page-title";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/admin/overview-tab";
import { UsersTab } from "@/components/admin/users-tab";
import { AccessTab } from "@/components/admin/access-tab";
import { SystemTab } from "@/components/admin/system-tab";
import { AuditTab } from "@/components/admin/audit-tab";

const TABS = ["overview", "users", "access", "system", "audit"] as const;

export default function AdminPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = TABS.find((t) => t === requested) ?? "overview";

  return (
    <div className="space-y-6 p-6">
      <PageTitle title="Admin" />
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Run this instance. You see accounts and aggregate usage, never anyone's jobs or resumes.
        </p>
      </div>
      <Tabs value={tab} onValueChange={(t) => setParams(t === "overview" ? {} : { tab: t }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersTab currentUserEmail={user?.email ?? ""} /></TabsContent>
        <TabsContent value="access" className="mt-4"><AccessTab /></TabsContent>
        <TabsContent value="system" className="mt-4"><SystemTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  );
}
