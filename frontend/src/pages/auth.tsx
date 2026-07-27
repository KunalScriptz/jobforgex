import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles } from "lucide-react";

export default function AuthPage() {
  const navigate = useNavigate();
  const { isAuthenticated, login, register } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate("/jobs");
  }, [isAuthenticated, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="mt-2">Welcome to JobForge</CardTitle>
          <CardDescription>Sign in or create your workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="mt-4">
              <AuthForm mode="signin" busy={busy} setBusy={setBusy} navigate={navigate} login={login} />
            </TabsContent>
            <TabsContent value="signup" className="mt-4">
              <AuthForm mode="signup" busy={busy} setBusy={setBusy} navigate={navigate} register={register} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function AuthForm({
  mode,
  busy,
  setBusy,
  navigate,
  login,
  register,
}: {
  mode: "signin" | "signup";
  busy: boolean;
  setBusy: (v: boolean) => void;
  navigate: (path: string) => void;
  login?: (data: { email: string; password: string }) => Promise<any>;
  register?: (data: { email: string; password: string; full_name?: string }) => Promise<any>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup" && register) {
        await register({ email, password, full_name: fullName });
        toast.success("Account created. Redirecting...");
        navigate("/onboarding");
      } else if (login) {
        await login({ email, password });
        toast.success("Signed in");
        navigate("/jobs");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {mode === "signup" && (
        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={100} />
        </div>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "..." : mode === "signup" ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}
