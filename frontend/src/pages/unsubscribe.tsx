import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { usersApi } from "@/api/users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTitle } from "@/components/page-title";
import logoImg from "@/assets/logo.png";

type State = "working" | "done" | "error";

/** Public page behind the "Unsubscribe" link in the digest email. The signed token is the credential. */
export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>(token ? "working" : "error");
  const [message, setMessage] = useState(token ? "" : "This unsubscribe link is incomplete.");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // the request is idempotent, but don't fire it twice under StrictMode
    usersApi
      .unsubscribeDigest(token)
      .then(() => setState("done"))
      .catch((e: any) => {
        setMessage(String(e?.response?.data?.detail || "Something went wrong. Please try again."));
        setState("error");
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <PageTitle title="Unsubscribe" />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={logoImg} alt="JobForge" className="mx-auto h-12 w-12" />
          <CardTitle className="mt-2">Digest emails</CardTitle>
          <CardDescription>Manage the JobForge digest email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {state === "working" && (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Unsubscribing...
            </p>
          )}
          {state === "done" && (
            <>
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="text-sm">You're unsubscribed. You won't get the daily digest any more.</p>
              <p className="text-xs text-muted-foreground">
                Changed your mind? You can turn it back on any time in Settings.
              </p>
            </>
          )}
          {state === "error" && (
            <>
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
              <p className="text-sm">{message}</p>
            </>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link to="/settings">Go to Settings</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
