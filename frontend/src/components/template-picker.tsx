import { useEffect, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResumes } from "@/hooks/use-resumes";
import type { Resume } from "@/api/resumes";

/** Pick the id that should be preselected: the workspace default, else the first template. */
export function resolveDefaultTemplateId(templates: Resume[] | undefined): string {
  if (!templates || templates.length === 0) return "";
  return templates.find((t) => t.is_default)?.id ?? templates[0].id;
}

/**
 * Shared template selector for document generation. If the current value is not
 * in the list (e.g. after a template was deleted), it converges onto the
 * workspace default template.
 */
export default function TemplatePicker({
  value,
  onChange,
  templates,
}: {
  value: string;
  onChange: (id: string) => void;
  templates?: Resume[];
}) {
  const { data: fetched } = useResumes();
  const list = templates ?? fetched ?? [];

  const effectiveValue = useMemo(
    () => (list.some((t) => t.id === value) ? value : resolveDefaultTemplateId(list)),
    [list, value],
  );

  useEffect(() => {
    if (effectiveValue && effectiveValue !== value) onChange(effectiveValue);
  }, [effectiveValue, value, onChange]);

  if (list.length === 0) return null;

  return (
    <Select value={effectiveValue || undefined} onValueChange={onChange} disabled={list.length === 1}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose a template…" />
      </SelectTrigger>
      <SelectContent>
        {list.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            <span>{t.name}</span>
            {t.is_default && <span className="ml-2 text-xs text-muted-foreground">★ default</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
