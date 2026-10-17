import { useQuery } from "@tanstack/react-query";

import { adminApi } from "@/api/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

const LABELS: Record<string, string> = {
  delete_user: "Deleted user",
  set_ai_cap: "Changed AI cap",
  update_settings: "Changed settings",
  allowlist_add: "Added to allowlist",
  allowlist_remove: "Removed from allowlist",
};

export function AuditTab() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["admin", "audit"], queryFn: adminApi.audit });

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow><TableHead>When</TableHead><TableHead>Admin</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Details</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {isError && <TableRow><TableCell colSpan={5} className="text-destructive">Could not load the audit log.</TableCell></TableRow>}
            {isLoading && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {data?.items.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No admin actions yet.</TableCell></TableRow>}
            {data?.items.map((a, i) => (
              <TableRow key={i}>
                <TableCell className="whitespace-nowrap text-xs">{formatDateTime(a.at)}</TableCell>
                <TableCell className="text-sm">{a.admin_email}</TableCell>
                <TableCell className="text-sm font-medium">{LABELS[a.action] ?? a.action}</TableCell>
                <TableCell className="text-sm">{a.target_email ?? "-"}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={a.detail ? JSON.stringify(a.detail) : ""}>
                  {a.detail ? JSON.stringify(a.detail) : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
