import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { useCreateWorkspace } from "@/hooks/use-workspace";
import { useSaveBaseResume } from "@/hooks/use-resumes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const createWs = useCreateWorkspace();
  const saveResume = useSaveBaseResume();

  const [step, setStep] = useState(1);
  const [wsName, setWsName] = useState(user?.full_name || "My Workspace");
  const [latexSource, setLatexSource] = useState("");

  const handleCreateWorkspace = async () => {
    try {
      await createWs.mutateAsync({ name: wsName });
      toast.success("Workspace created");
      setStep(2);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create workspace");
    }
  };

  const handleSaveResume = async () => {
    try {
      await saveResume.mutateAsync({ latex_source: latexSource, name: "Base Resume" });
      toast.success("Resume saved. All set!");
      navigate("/jobs");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to save resume");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="mt-2">Welcome aboard</CardTitle>
          <CardDescription>
            {step === 1 ? "Name your workspace" : "Paste your base LaTeX resume"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="wsName">Workspace name</Label>
                <Input
                  id="wsName"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>
              <Button onClick={handleCreateWorkspace} disabled={createWs.isPending} className="w-full">
                {createWs.isPending ? "Creating..." : "Continue"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="latex">LaTeX source (optional)</Label>
                <Textarea
                  id="latex"
                  value={latexSource}
                  onChange={(e) => setLatexSource(e.target.value)}
                  rows={12}
                  placeholder="Paste your LaTeX resume source here. You can skip this and add it later."
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSaveResume} className="w-full">
                  Skip for now
                </Button>
                <Button onClick={handleSaveResume} disabled={saveResume.isPending} className="w-full">
                  {saveResume.isPending ? "Saving..." : "Save & Continue"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
