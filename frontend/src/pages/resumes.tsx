import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useResumes, useBaseResume, useSaveBaseResume, useResumeVersions, useCompileArtifact } from "@/hooks/use-resumes";
import { resumesApi } from "@/api/resumes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Download, History } from "lucide-react";

export default function ResumesPage() {
  const { data: baseResume, refetch } = useBaseResume();
  const saveResume = useSaveBaseResume();
  const compileArtifact = useCompileArtifact();

  const [latexSource, setLatexSource] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#00008c");
  const [secondaryColor, setSecondaryColor] = useState("#00a698");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (baseResume) {
      setLatexSource(baseResume.latex_source);
      setPrimaryColor(baseResume.primary_color);
      setSecondaryColor(baseResume.secondary_color);
    }
  }, [baseResume]);

  const handleSave = async () => {
    try {
      await saveResume.mutateAsync({ latex_source: latexSource });
      toast.success("Resume saved");
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to save");
    }
  };

  const handleCompile = async () => {
    if (!baseResume) {
      toast.error("No base resume found");
      return;
    }
    try {
      const result = await compileArtifact.mutateAsync(baseResume.id);
      if (result.ok) {
        const urlData = await resumesApi.getPdfUrl(baseResume.id, true);
        setPdfUrl(urlData.url);
        toast.success("PDF compiled");
      } else {
        toast.error(result.error || "Compile failed");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Compile failed");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Resumes</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>LaTeX Editor</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleSave} disabled={saveResume.isPending}>
                  <Save className="mr-1 h-4 w-4" /> Save
                </Button>
                <Button size="sm" onClick={handleCompile} disabled={compileArtifact.isPending}>
                  Compile
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex gap-2">
              <div className="flex items-center gap-1">
                <Label className="text-xs">Primary</Label>
                <Input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-8 w-12 p-0"
                />
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-xs">Secondary</Label>
                <Input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-8 w-12 p-0"
                />
              </div>
            </div>
            <Textarea
              value={latexSource}
              onChange={(e) => setLatexSource(e.target.value)}
              rows={30}
              className="font-mono text-sm resize-none"
              placeholder="Paste your LaTeX resume source here..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {pdfUrl ? (
              <iframe src={pdfUrl} className="w-full h-[600px] rounded border" title="PDF Preview" />
            ) : (
              <div className="flex h-[600px] items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <p>No PDF preview available</p>
                  <p className="text-sm mt-1">Save your LaTeX source and click "Compile"</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
