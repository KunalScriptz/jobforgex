// Minimal LaTeX compile server. Runs pdflatex against a POSTed source string
// and streams the resulting PDF back. Designed to sit behind JobForge's
// compileLatex server function (see src/lib/latex.functions.ts).
//
//   POST /compile   { "source": "<latex>" }  ->  application/pdf
//   GET  /health    ->  "ok"
//
// Security: set SHARED_SECRET env var and pass it as `x-shared-secret`
// header from JobForge's server function to lock it down to your app.

const express = require("express");
const { spawn } = require("child_process");
const { mkdtemp, writeFile, readFile, rm } = require("fs/promises");
const { tmpdir } = require("os");
const path = require("path");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 8080;
const SHARED_SECRET = process.env.SHARED_SECRET || "";

app.get("/health", (_req, res) => res.type("text").send("ok"));

app.post("/compile", async (req, res) => {
  if (SHARED_SECRET && req.get("x-shared-secret") !== SHARED_SECRET) {
    return res.status(401).type("text").send("unauthorized");
  }
  const source = typeof req.body?.source === "string" ? req.body.source : "";
  if (source.length < 10) return res.status(400).type("text").send("source too short");

  const dir = await mkdtemp(path.join(tmpdir(), "tex-"));
  const texPath = path.join(dir, "main.tex");
  const pdfPath = path.join(dir, "main.pdf");
  const logPath = path.join(dir, "main.log");

  try {
    await writeFile(texPath, source, "utf8");
    // Two passes so refs/toc settle. -interaction=nonstopmode keeps pdflatex from hanging.
    for (let i = 0; i < 2; i++) {
      const code = await run("pdflatex", [
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-output-directory", dir,
        texPath,
      ], dir);
      if (code !== 0) break;
    }

    let pdf;
    try { pdf = await readFile(pdfPath); } catch { pdf = null; }
    if (!pdf) {
      const log = await readFile(logPath, "utf8").catch(() => "no log produced");
      return res.status(400).type("text").send(tailLog(log));
    }
    res.type("application/pdf").send(pdf);
  } catch (err) {
    res.status(500).type("text").send(String(err?.message || err));
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd });
    p.stdout.on("data", () => {});
    p.stderr.on("data", () => {});
    p.on("close", (code) => resolve(code ?? 1));
  });
}

function tailLog(log) {
  // Return the error-relevant tail so the client can display it.
  const lines = log.split("\n");
  const startIdx = Math.max(0, lines.findIndex((l) => l.startsWith("! ")));
  return lines.slice(startIdx || Math.max(0, lines.length - 80)).join("\n").slice(-4000);
}

app.listen(PORT, () => console.log(`LaTeX server listening on :${PORT}`));