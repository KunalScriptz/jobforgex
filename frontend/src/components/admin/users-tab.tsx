import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Search, Trash2, Gauge } from "lucide-react";

import { adminApi, type AdminUser } from "@/api/admin";
import { apiErrorMessage } from "@/hooks/use-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDate } from "@/lib/format";

const PAGE_SIZE = 25;
const usd = (v: number) => `$${v.toFixed(2)}`;

export function UsersTab({ currentUserEmail }: { currentUserEmail: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [capUser, setCapUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "users", debounced, page],
    queryFn: () => adminApi.users({ search: debounced || undefined, page, page_size: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });

  const lastPage = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {data && <span className="text-sm text-muted-foreground">{data.total} user{data.total === 1 ? "" : "s"}</span>}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="text-right">Jobs</TableHead>
                <TableHead className="text-right">AI this month</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isError && (
                <TableRow><TableCell colSpan={6} className="text-destructive">Could not load users.</TableCell></TableRow>
              )}
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {data?.items.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">No users match.</TableCell></TableRow>
              )}
              {data?.items.map((u) => {
                const isYou = u.email.toLowerCase() === currentUserEmail.toLowerCase();
                const over = u.ai_cap_effective !== null && u.ai_cost_this_month >= u.ai_cap_effective;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{u.email}</span>
                        {u.role === "admin" && <Badge variant="secondary">admin</Badge>}
                        {isYou && <Badge variant="outline">you</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {u.full_name || "No name"}{!u.onboarding_complete && " · setup not finished"}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(u.created_at)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {u.last_login_at ? formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true }) : "never"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.jobs}</TableCell>
                    <TableCell className={`whitespace-nowrap text-right tabular-nums ${over ? "font-semibold text-destructive" : ""}`}>
                      {usd(u.ai_cost_this_month)}
                      {u.ai_cap_effective !== null && (
                        <span className="text-muted-foreground"> / {usd(u.ai_cap_effective)}{u.ai_cap_override === null ? "" : "*"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Set AI cap" onClick={() => setCapUser(u)}>
                          <Gauge className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title={isYou ? "You can't delete yourself here" : "Delete user"}
                          disabled={isYou} onClick={() => setDeleteUser(u)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>* per-user cap. Others use the instance default.</span>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span>Page {page} of {lastPage}</span>
          <Button size="icon" variant="outline" disabled={page >= lastPage} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <CapDialog user={capUser} onClose={() => setCapUser(null)} onDone={() => qc.invalidateQueries({ queryKey: ["admin", "users"] })} />
      <DeleteDialog user={deleteUser} onClose={() => setDeleteUser(null)} onDone={() => {
        qc.invalidateQueries({ queryKey: ["admin"] });
      }} />
    </div>
  );
}

function CapDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: () => void }) {
  const [value, setValue] = useState("");
  useEffect(() => { setValue(user?.ai_cap_override != null ? String(user.ai_cap_override) : ""); }, [user]);

  const save = useMutation({
    mutationFn: (cap: number | null) => adminApi.setAiCap(user!.id, cap),
    onSuccess: () => { toast.success("AI cap updated"); onDone(); onClose(); },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not update the cap")),
  });

  const parsed = value.trim() === "" ? null : Number(value);
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < 0);

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Monthly AI cap</DialogTitle>
          <DialogDescription>
            {user?.email}. Once this user's AI spend for the calendar month reaches the cap, their AI features pause until next month or until you raise it.
            Leave blank to use the instance default. Admins are never capped.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cap">Cap in USD</Label>
          <Input id="cap" inputMode="decimal" placeholder="Instance default" value={value} onChange={(e) => setValue(e.target.value)} />
          {invalid && <p className="text-xs text-destructive">Enter a number of 0 or more.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={invalid || save.isPending} onClick={() => save.mutate(parsed)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState("");
  useEffect(() => setTyped(""), [user]);

  const del = useMutation({
    mutationFn: () => adminApi.deleteUser(user!.id, typed),
    onSuccess: () => { toast.success(`Deleted ${user!.email}`); onDone(); onClose(); },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not delete the user")),
  });
  const matches = !!user && typed.trim().toLowerCase() === user.email.toLowerCase();

  return (
    <AlertDialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete this user?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes {user?.email} and everything they own: jobs, resumes, tailored documents and AI history.
            It can't be undone, and they'll be emailed that their account was deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-email">Type their email to confirm</Label>
          <Input id="confirm-email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={user?.email} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={!matches || del.isPending} onClick={() => del.mutate()}>
            Delete permanently
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
