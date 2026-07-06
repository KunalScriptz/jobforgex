import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, FileText, LayoutDashboard, DollarSign } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-5 w-5 text-primary" />
          JobForge
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
          <Button asChild size="sm"><Link to="/auth">Get started</Link></Button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
          Your AI-powered<br />job search command center.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Tailor LaTeX resumes with DeepSeek, generate cover letters, track every application, and see the exact cost per generation.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg"><Link to="/auth">Start free</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/auth">Sign in</Link></Button>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Sparkles, title: "AI resume tailoring", body: "Paste a JD, get a tailored LaTeX resume that preserves your template and page count." },
            { icon: FileText, title: "Cover letters", body: "Optional AI-generated cover letters grounded in your resume, ready to compile." },
            { icon: LayoutDashboard, title: "Kanban tracking", body: "Boards per year, columns per stage. Never lose a lead again." },
            { icon: DollarSign, title: "Cost analytics", body: "Every AI call is priced and logged. See spend by day, model, and purpose." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border bg-card p-5">
              <Icon className="h-5 w-5 text-primary" />
              <div className="mt-3 font-medium">{title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{body}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
