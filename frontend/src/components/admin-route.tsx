import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/use-admin";

/** Sends non-admins to /jobs. UI only: every /api/v1/admin route is admin-checked server-side. */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/jobs" replace />;
  return <>{children}</>;
}
