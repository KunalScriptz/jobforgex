import { Navigate, useSearchParams } from "react-router-dom";

import { InboxTab } from "@/components/discovery/inbox-tab";
import { SearchesTab } from "@/components/discovery/searches-tab";
import { PageTitle } from "@/components/page-title";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFeatures } from "@/hooks/use-features";

const TABS = ["inbox", "searches"] as const;

export default function DiscoveryPage() {
  const { features, isLoading } = useFeatures();
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = TABS.find((t) => t === requested) ?? "inbox";
  const setTab = (t: string) => setParams(t === "inbox" ? {} : { tab: t }, { replace: true });

  if (isLoading) return null;
  if (!features?.discovery) return <Navigate to="/jobs" replace />;

  return (
    <div className="space-y-6 p-6">
      <PageTitle title="Discovery" />
      <div>
        <h1 className="text-2xl font-bold">Discovery</h1>
        <p className="text-sm text-muted-foreground">
          New postings from job boards that match your searches, ranked by how well they fit your resume. Add the good ones to your board, dismiss the rest.
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="searches">Searches</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="mt-4"><InboxTab onGoToSearches={() => setTab("searches")} /></TabsContent>
        <TabsContent value="searches" className="mt-4"><SearchesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
