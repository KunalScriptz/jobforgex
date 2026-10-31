import { Badge } from "@/components/ui/badge";

const LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  naukri: "Naukri",
  glassdoor: "Glassdoor",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
};

export function sourceLabel(name: string) {
  return LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

export function SourceBadge({ source }: { source: string }) {
  return <Badge variant="outline">{sourceLabel(source)}</Badge>;
}
