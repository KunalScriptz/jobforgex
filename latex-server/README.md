# JobForge LaTeX Compile Server

A tiny self-hosted `pdflatex` HTTP endpoint. Runs full TeX Live, so it renders
**exactly like Overleaf**. Deploy it once, paste its URL into JobForge's
`LATEX_COMPILE_URL` secret, and the preview + downloads compile against your
own server — no third-party service sees your resume source.

## Endpoints
- `GET /health` → `ok`
- `POST /compile` with JSON `{ "source": "<latex>" }` → `application/pdf`
  (or `400` with the error log tail as `text/plain`)
- Optional: set `SHARED_SECRET` env and pass `x-shared-secret` header.

## Deploy options (pick one)

### A) Fly.io (recommended, free tier works)
```bash
cd latex-server
fly launch --no-deploy   # accept defaults, region near you
fly deploy
fly status               # note the hostname, e.g. jobforge-latex.fly.dev
```
First image is big (~2GB — full TeX Live). Give it a machine with at least
1GB RAM: `fly scale memory 1024`.

### B) Render.com
1. New → Web Service → point at a repo containing this folder.
2. Environment: **Docker**. Root: `latex-server/`.
3. Deploy. Copy the `https://...onrender.com` URL.

### C) Any VPS / Docker host
```bash
cd latex-server
docker build -t jobforge-latex .
docker run -d -p 8080:8080 --name jobforge-latex jobforge-latex
```
Put it behind a reverse proxy with HTTPS (Caddy/Traefik).

## Wire it to JobForge
In Lovable → Cloud → Secrets add:
- `LATEX_COMPILE_URL` = `https://<your-host>` (no trailing slash, no `/compile`)
- optional `LATEX_SHARED_SECRET` if you set `SHARED_SECRET` on the server

That's it — the preview panel and any future PDF download go through your box.

## Notes
- First cold compile can take 3–10 s while TeX loads formats. Subsequent
  compiles on the same instance are typically under 1 s.
- Runs two `pdflatex` passes so `\ref` / `\tableofcontents` settle.
- No shell escape (`-shell-escape` is off). Do NOT enable it — user LaTeX
  input would then be arbitrary code execution.