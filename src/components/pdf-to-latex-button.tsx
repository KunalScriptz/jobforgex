import { useRef, useState } from "react";
import { useServerFn, createClientOnlyFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { convertPdfTextToLatex } from "@/lib/resumes.functions";

const extractPdf = createClientOnlyFn(async (file: File): Promise<string> => {
  const { extractPdfText } = await import("@/lib/pdf-extract.client");
  return extractPdfText(file);
});

type Props = {
  onLatex: (latex: string) => void;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
  label?: string;
};

/**
 * Lets the user pick a PDF resume; extracts its text in the browser and asks
 * the configured AI provider to convert it into the JobForge LaTeX template.
 */
export function PdfToLatexButton({ onLatex, size = "sm", variant = "outline", label = "Import from PDF" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const convert = useServerFn(convertPdfTextToLatex);

  async function handleFile(file: File) {
    setBusy(true);
    const t = toast.loading("Reading PDF…");
    try {
      const { extractPdfText } = await import("@/lib/pdf-extract.client");
      const text = await extractPdfText(file);
      toast.loading("Converting to LaTeX with your AI model…", { id: t });
      const res = await convert({ data: { text } } as any);
      onLatex(res.latex);
      toast.success(`Converted (${res.model}, $${res.cost.toFixed(4)})`, { id: t });
    } catch (e: any) {
      toast.error(e?.message ?? String(e), { id: t });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileUp className="mr-1.5 h-4 w-4" />}
        {busy ? "Converting…" : label}
      </Button>
    </>
  );
}