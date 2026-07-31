import { useEffect } from "react";

export function PageTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = `JobForge | ${title}`;
    return () => {
      document.title = "JobForge";
    };
  }, [title]);
  return null;
}
