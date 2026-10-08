import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/context/auth-context";
import { PageTitle } from "@/components/page-title";
import logoImg from "@/assets/logo.png";

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    const refreshToken = searchParams.get("refresh_token");
    const isNewUser = searchParams.get("new_user") === "1";

    if (token && refreshToken) {
      localStorage.setItem("access_token", token);
      localStorage.setItem("refresh_token", refreshToken);
      if (isNewUser) {
        navigate("/onboarding");
      } else {
        navigate("/overview");
      }
      return;
    }

    if (isAuthenticated) {
      navigate("/overview");
    }
  }, [isAuthenticated, navigate, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <PageTitle title="Sign In" />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center">
            <img src={logoImg} alt="JobForge" className="h-12 w-12" />
          </div>
          <CardTitle className="mt-2">Welcome to JobForge</CardTitle>
          <CardDescription>Sign in or create your account with Google.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={() =>
              (window.location.href = `${import.meta.env.VITE_API_URL || ""}/api/v1/auth/google/login`)
            }
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </Button>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Job search, structured. Secure sign-in powered by Google.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
