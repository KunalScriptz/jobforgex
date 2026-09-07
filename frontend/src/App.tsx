import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/auth-context";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { TourProvider } from "@/components/tour";
import AuthPage from "@/pages/auth";
import OnboardingPage from "@/pages/onboarding";
import JobsPage from "@/pages/jobs";
import ResumesPage from "@/pages/resumes";
import GeneratePage from "@/pages/generate";
import CheckerPage from "@/pages/checker";
import BuilderPage from "@/pages/builder";
import BuilderIndexPage from "@/pages/builder-index";
import BillingPage from "@/pages/billing";
import SettingsPage from "@/pages/settings";
import LandingPage from "@/pages/landing";
import PrivacyPage from "@/pages/privacy";
import AdminOverviewPage from "@/pages/admin/overview";
import AdminSubscriptionsPage from "@/pages/admin/subscriptions";
import WhatsNewPage from "@/pages/whats-new";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return (
    <AppShell>
      {children}
    </AppShell>
  );
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <ProtectedRoute>
      {user?.role === "admin" ? children : <Navigate to="/jobs" replace />}
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <TourProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/jobs" element={<ProtectedRoute><JobsPage /></ProtectedRoute>} />
        <Route path="/resumes" element={<ProtectedRoute><ResumesPage /></ProtectedRoute>} />
        <Route path="/generate" element={<ProtectedRoute><GeneratePage /></ProtectedRoute>} />
        <Route path="/checker" element={<ProtectedRoute><CheckerPage /></ProtectedRoute>} />
        <Route path="/builder" element={<ProtectedRoute><BuilderIndexPage /></ProtectedRoute>} />
        <Route path="/builder/:jobId" element={<ProtectedRoute><BuilderPage /></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
        <Route path="/billing-test" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminOverviewPage /></AdminRoute>} />
        <Route path="/admin/subscriptions" element={<AdminRoute><AdminSubscriptionsPage /></AdminRoute>} />
        <Route path="/whats-new" element={<ProtectedRoute><WhatsNewPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" />
    </TourProvider>
  );
}
