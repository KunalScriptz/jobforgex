import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { aiApi } from "@/api/ai";

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

  async function handleFile(file: File) {
    setBusy(true);
    const t = toast.loading("Reading your PDF…");
    try {
      const { extractPdfText } = await import("@/lib/pdf-extract.client");
      const text = await extractPdfText(file);
      if (!text) throw new Error("PDF extraction is only available in the browser.");
      toast.loading("Converting to editable LaTeX…", { id: t });
      const res = await aiApi.generate({
        prompt_name: "pdf_to_latex",
        vars: { resume_text: text },
      });
      onLatex(res.content);
      toast.success("Converted! Your resume is now in LaTeX format.", { id: t });
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
