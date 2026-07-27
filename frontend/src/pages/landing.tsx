import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted/30">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold">JobForge</span>
        </div>
        <div className="flex gap-2">
          <Link to="/auth">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/auth?signup=1">
            <Button>
              Get Started <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Your AI-Powered
            <br />
            <span className="text-primary">Job Search Engine</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Track applications on a Kanban board, tailor LaTeX resumes and cover letters
            per job description using AI, and land your dream job faster.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link to="/auth?signup=1">
              <Button size="lg" className="w-full sm:w-auto">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Sign In
              </Button>
            </Link>
          </div>
          <div className="mt-16 grid gap-8 sm:grid-cols-3">
            {[
              { title: "Kanban Tracking", desc: "Drag & drop jobs across stages from wishlist to offer." },
              { title: "AI Tailoring", desc: "LaTeX resumes tailored per job description using DeepSeek AI." },
              { title: "ATS Checker", desc: "Score your resume against any job description in seconds." },
            ].map((f) => (
              <div key={f.title} className="rounded-lg border bg-card p-6 text-left">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        JobForge — Built for job seekers who take their career seriously.
      </footer>
    </div>
  );
}
