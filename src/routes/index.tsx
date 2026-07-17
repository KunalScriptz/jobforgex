import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, FileText, LayoutDashboard, ClipboardCheck, Mail, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import screenshotKanban from "@/assets/screenshot-kanban.png";
import screenshotResume from "@/assets/screenshot-resume.png";

export const Route = createFileRoute("/")({ component: Landing });

const PHRASES = [
  "tailor resumes with AI.",
  "generate cover letters.",
  "track every application.",
  "autofill from any job board.",
  "land more interviews.",
  "run AI tools on any JD.",
];

function useTypewriter(words: string[], typeMs = 65, holdMs = 1400, eraseMs = 35) {
  const [text, setText] = useState("");
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"type" | "hold" | "erase">("type");

  useEffect(() => {
    const word = words[i % words.length];
    let t: ReturnType<typeof setTimeout>;
    if (phase === "type") {
      if (text.length < word.length) {
        t = setTimeout(() => setText(word.slice(0, text.length + 1)), typeMs);
      } else {
        t = setTimeout(() => setPhase("erase"), holdMs);
      }
    } else if (phase === "erase") {
      if (text.length > 0) {
        t = setTimeout(() => setText(word.slice(0, text.length - 1)), eraseMs);
      } else {
        setI((n) => n + 1);
        setPhase("type");
      }
    }
    return () => clearTimeout(t!);
  }, [text, phase, i, words, typeMs, holdMs, eraseMs]);

  return text;
}

function Landing() {
  const typed = useTypewriter(PHRASES);
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
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          One workspace to{" "}
          <span className="font-medium text-foreground">
            {typed}
            <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-primary align-middle" style={{ height: "1em" }} />
          </span>
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
            { icon: ClipboardCheck, title: "ATS check & fit scoring", body: "Instantly see how your base and tailored resumes score against each JD, with actionable fixes." },
            { icon: Wand2, title: "AI tools on every job", body: "Recruiter outreach, referral asks, interview prep, salary negotiation, thank-you notes, and more — grounded in the JD." },
            { icon: Sparkles, title: "Ask AI on any document", body: "Chat with any generated resume or cover letter to answer questions or make targeted edits, then auto-recompile the PDF." },
            { icon: FileText, title: "Import PDF → LaTeX", body: "Upload your existing PDF resume and JobForge converts it into an editable LaTeX base resume." },
            { icon: LayoutDashboard, title: "Chrome extension", body: "One-click save any job from LinkedIn, Indeed, JobStreet, SEEK, Glassdoor and more — with auto-detected location." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border bg-card p-5">
              <Icon className="h-5 w-5 text-primary" />
              <div className="mt-3 font-medium">{title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{body}</div>
            </div>
          ))}
        </div>

        <section className="mt-24">
          <div className="mb-10 max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">See it in action</div>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need, in one workspace.
            </h2>
          </div>

          <div className="space-y-16">
            {[
              {
                img: screenshotKanban,
                title: "Track every application on a Kanban board.",
                body: "Drag jobs between Wishlist → Applied → Interview → Offer → Rejected. Bulk-select to move or delete. Filter by board, year, or keyword.",
              },
              {
                img: screenshotResume,
                title: "Edit your LaTeX resume with a live PDF preview.",
                body: "Paste your LaTeX, tweak colors, compile inline. Every save is versioned so you can roll back anytime.",
                flip: true,
              },
            ].map((s, idx) => (
              <div
                key={idx}
                className={`grid items-center gap-8 lg:grid-cols-5 ${s.flip ? "lg:[&>*:first-child]:order-2" : ""}`}
              >
                <div className="lg:col-span-3 overflow-hidden rounded-xl border bg-card shadow-2xl shadow-primary/10">
                  <img src={s.img} alt={s.title} loading="lazy" className="w-full" />
                </div>
                <div className="lg:col-span-2">
                  <h3 className="text-2xl font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-3 text-muted-foreground">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 rounded-2xl border bg-card p-10 text-center">
          <h3 className="text-2xl font-semibold">Ready to end the copy-paste chaos?</h3>
          <p className="mt-2 text-muted-foreground">Start free with 2 applications. Upgrade to Pro for unlimited generations.</p>
          <Button asChild size="lg" className="mt-6"><Link to="/auth">Get started</Link></Button>
        </section>
      </main>

      <footer className="border-t bg-card/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-5 w-5 text-primary" /> JobForge
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Your AI-powered job search command center.
            </p>
          </div>
          <div>
            <div className="text-sm font-medium">Product</div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link to="/auth" className="hover:text-foreground">Get started</Link></li>
              <li><Link to="/auth" className="hover:text-foreground">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-medium">Support</div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  className="hover:text-foreground"
                  href={`mailto:support@jobforgex.com?subject=${encodeURIComponent("JobForge support request")}&body=${encodeURIComponent(
                    "Hi JobForge team,\n\n• What I was trying to do:\n• What happened instead:\n• Workspace email:\n• Steps to reproduce (if any):\n\nThanks!"
                  )}`}
                >
                  Contact support
                </a>
              </li>
              <li>
                <a
                  className="hover:text-foreground"
                  href={`mailto:support@jobforgex.com?subject=${encodeURIComponent("JobForge feedback")}&body=${encodeURIComponent(
                    "Hi JobForge team,\n\nHere's some feedback:\n\n"
                  )}`}
                >
                  Send feedback
                </a>
              </li>
              <li>
                <a
                  className="hover:text-foreground"
                  href={`mailto:support@jobforgex.com?subject=${encodeURIComponent("JobForge Pro upgrade request")}&body=${encodeURIComponent(
                    "Hi JobForge team,\n\nI'd like to upgrade to:\n• Plan: (Starter / Pro Monthly / Pro Yearly)\n• Currency: (INR / USD)\n• Workspace email:\n\nThanks!"
                  )}`}
                >
                  Upgrade plan
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-medium">Contact</div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <a className="hover:text-foreground" href="mailto:support@jobforgex.com">
                  support@jobforgex.com
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t px-6 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} JobForge. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
