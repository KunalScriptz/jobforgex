(function () {
  if (window.__jobforgeInjected) return;
  window.__jobforgeInjected = true;

  const HOST_FALLBACK = "https://jobforgex.lovable.app";

  // ---------- Scraping heuristics ---------------------------------------

  function text(el) { return (el && (el.innerText || el.textContent) || "").trim(); }
  function pickMeta(name) {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return el ? el.getAttribute("content") : "";
  }

  function guessTitle() {
    return (
      text(document.querySelector("h1")) ||
      pickMeta("og:title") ||
      document.title.split(/[|\-–]/)[0].trim()
    );
  }

  function guessCompany() {
    const host = location.hostname.replace(/^www\./, "");
    // Greenhouse: job-boards.greenhouse.io/<slug>/jobs/<id>
    if (host.includes("greenhouse.io")) {
      const m = location.pathname.match(/^\/([^\/]+)/);
      if (m) return prettify(m[1]);
    }
    // Lever: jobs.lever.co/<company>/<id>
    if (host.includes("lever.co")) {
      const m = location.pathname.match(/^\/([^\/]+)/);
      if (m) return prettify(m[1]);
    }
    if (host.includes("ashbyhq.com")) {
      const m = location.pathname.match(/^\/([^\/]+)/);
      if (m) return prettify(m[1]);
    }
    // LinkedIn: look at company link
    const li = document.querySelector('a[href*="/company/"]');
    if (li) return text(li);
    const og = pickMeta("og:site_name");
    if (og && og.toLowerCase() !== "linkedin") return og;
    return prettify(host.split(".")[0]);
  }

  function guessDescription() {
    const candidates = [
      '[data-testid*="job-description"]',
      "#job_description",
      ".job-description",
      ".jobs-description__content",
      "#content",
      "main",
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && text(el).length > 200) return text(el);
    }
    return text(document.body).slice(0, 20000);
  }

  function prettify(slug) {
    return (slug || "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function scrape() {
    return {
      company: guessCompany(),
      title: guessTitle(),
      url: location.href,
      description: guessDescription(),
    };
  }

  // ---------- UI --------------------------------------------------------

  const fab = document.createElement("button");
  fab.id = "jobforge-fab";
  fab.innerHTML = `<span class="dot"></span> Save to JobForge`;
  document.documentElement.appendChild(fab);

  let panel = null;
  fab.addEventListener("click", () => {
    if (panel) { panel.remove(); panel = null; return; }
    openPanel();
  });

  function openPanel() {
    const data = scrape();
    panel = document.createElement("div");
    panel.id = "jobforge-panel";
    panel.innerHTML = `
      <button class="close" title="Close">×</button>
      <h3>Save this job</h3>
      <div class="field"><label>Company</label><input id="jf-company" /></div>
      <div class="field"><label>Title</label><input id="jf-title" /></div>
      <div class="field"><label>URL</label><input id="jf-url" /></div>
      <div class="actions">
        <button id="jf-save">Save to board</button>
        <button id="jf-autofill" class="secondary" title="Coming soon">Autofill</button>
      </div>
      <div class="status" id="jf-status"></div>
    `;
    document.documentElement.appendChild(panel);
    panel.querySelector("#jf-company").value = data.company;
    panel.querySelector("#jf-title").value = data.title;
    panel.querySelector("#jf-url").value = data.url;
    panel.querySelector(".close").addEventListener("click", () => { panel.remove(); panel = null; });
    panel.querySelector("#jf-save").addEventListener("click", saveJob);
    panel.querySelector("#jf-autofill").addEventListener("click", tryAutofill);
  }

  function status(text, cls) {
    const el = panel && panel.querySelector("#jf-status");
    if (el) { el.textContent = text; el.className = "status " + (cls || ""); }
  }

  async function saveJob() {
    const payload = {
      company: panel.querySelector("#jf-company").value.trim(),
      title: panel.querySelector("#jf-title").value.trim(),
      url: panel.querySelector("#jf-url").value.trim(),
      description: scrape().description,
    };
    if (!payload.company || !payload.title) { status("Company and title required.", "err"); return; }
    status("Saving…");
    chrome.storage.local.get(["host", "token"], async (cfg) => {
      const host = (cfg.host || HOST_FALLBACK).replace(/\/$/, "");
      const token = cfg.token;
      if (!token) { status("Open the extension popup and paste your token.", "err"); return; }
      try {
        const res = await fetch(`${host}/api/public/extension/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (res.ok) status("Saved to your board!", "ok");
        else if (res.status === 401) status("Token rejected — reconnect.", "err");
        else status(`Save failed (${res.status})`, "err");
      } catch (e) { status(e.message, "err"); }
    });
  }

  // Basic label/name-based autofill — populates common application fields
  // from data pulled from the JobForge profile (future enhancement).
  function tryAutofill() {
    status("Autofill coming soon — profile fields are being built.", "err");
  }
})();