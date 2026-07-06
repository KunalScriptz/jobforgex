(function () {
  if (window.__jobforgeInjected) return;
  window.__jobforgeInjected = true;

  const HOST_FALLBACK = "https://jobforgex.lovable.app";

  // Don't inject on the JobForge app itself.
  const selfHosts = [/(^|\.)jobforgex\.lovable\.app$/i, /(^|\.)lovable\.app$/i, /^localhost$/i];
  if (selfHosts.some((r) => r.test(location.hostname))) return;

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
    // Naukri-specific
    if (host.includes("naukri.com")) {
      const n = document.querySelector('.styles_jd-header-comp-name__MvqAI a, .jd-header-comp-name a, .comp-name, [class*="companyName"] a, [class*="comp-name"]');
      if (n && text(n)) return text(n);
    }
    if (host.includes("indeed.com")) {
      const n = document.querySelector('[data-testid="inlineHeader-companyName"] a, [data-testid="inlineHeader-companyName"], [data-company-name="true"]');
      if (n && text(n)) return text(n);
    }
    if (host.includes("glassdoor.")) {
      const n = document.querySelector('[data-test="employer-name"], [class*="EmployerProfile_employerName"]');
      if (n && text(n)) return text(n);
    }
    // 1. Structured data (JobPosting schema)
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        const parsed = JSON.parse(s.textContent || "null");
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of arr) {
          const t = node && (node["@type"] || (node["@graph"] && "graph"));
          if (!node) continue;
          if (t === "JobPosting" && node.hiringOrganization) {
            const n = typeof node.hiringOrganization === "string" ? node.hiringOrganization : node.hiringOrganization.name;
            if (n) return String(n).trim();
          }
          if (node["@graph"]) {
            for (const g of node["@graph"]) {
              if (g && g["@type"] === "JobPosting" && g.hiringOrganization) {
                const n = typeof g.hiringOrganization === "string" ? g.hiringOrganization : g.hiringOrganization.name;
                if (n) return String(n).trim();
              }
            }
          }
        }
      }
    } catch (_) {}
    // LinkedIn-specific selectors (run before generic meta because og:site_name = "LinkedIn")
    if (host.includes("linkedin.com")) {
      const liSelectors = [
        '.job-details-jobs-unified-top-card__company-name a',
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name a',
        '.jobs-unified-top-card__company-name',
        '.topcard__org-name-link',
        '.topcard__flavor a',
        'a[data-tracking-control-name*="topcard-org-name"]',
        'a[href*="/company/"]',
      ];
      for (const sel of liSelectors) {
        const el = document.querySelector(sel);
        const n = el && text(el);
        if (n && n.length < 100 && !/linkedin/i.test(n)) return n;
      }
    }
    // 2. Common meta tags
    const metaCompany =
      pickMeta("twitter:data1") ||
      document.querySelector('meta[name="twitter:label1"][content*="ompany"]')?.nextElementSibling?.getAttribute("content");
    if (metaCompany && !/salary|location|linkedin/i.test(metaCompany)) return metaCompany.trim();
    // Greenhouse: job-boards.greenhouse.io/<slug>/jobs/<id>
    if (host.includes("greenhouse.io")) {
      const gh = document.querySelector('.company-name, [class*="company"]');
      if (gh && text(gh)) return text(gh).replace(/^at\s+/i, "");
      const m = location.pathname.match(/^\/([^\/]+)/);
      if (m) return prettify(m[1]);
    }
    // Lever: jobs.lever.co/<company>/<id>
    if (host.includes("lever.co")) {
      const lv = document.querySelector('.main-header-logo img, .main-header-text');
      if (lv) { const n = lv.getAttribute?.("alt") || text(lv); if (n) return n.trim(); }
      const m = location.pathname.match(/^\/([^\/]+)/);
      if (m) return prettify(m[1]);
    }
    if (host.includes("ashbyhq.com")) {
      const m = location.pathname.match(/^\/([^\/]+)/);
      if (m) return prettify(m[1]);
    }
    // LinkedIn / Indeed / generic
    const li = document.querySelector('a[href*="/company/"], a[data-tracking-control-name*="company"]');
    if (li && text(li)) return text(li).trim();
    const generic = document.querySelector('[data-company-name], [data-testid*="company" i], [class*="companyName" i], [class*="employer" i]');
    if (generic && text(generic)) return text(generic).trim();
    const og = pickMeta("og:site_name");
    if (og && og.toLowerCase() !== "linkedin") return og;
    // Title pattern: "Job Title at Company"
    const t = document.title;
    const atMatch = t.match(/\s+at\s+([^|\-–—]+)/i);
    if (atMatch) return atMatch[1].trim();
    const pipeMatch = t.split(/[|\-–—]/).map((s) => s.trim()).filter(Boolean);
    if (pipeMatch.length >= 2) return pipeMatch[pipeMatch.length - 1];
    return prettify(host.split(".")[0]);
  }

  function guessDescription() {
    const host = location.hostname.replace(/^www\./, "");
    // Site-specific JD containers (strip nav, sidebars, "similar jobs", etc.)
    const siteSelectors = {
      "naukri.com": [
        '.styles_JDC__dang-inner-html__h0K4t',
        '.job-desc',
        'section.styles_job-desc-container__txpYf',
        '[class*="JDC__dang-inner-html"]',
      ],
      "glassdoor.": [
        '[class*="JobDetails_jobDescription"]',
        '.jobDescriptionContent',
        '#JobDescriptionContainer',
      ],
      "linkedin.com": [
        '.jobs-description__content .jobs-box__html-content',
        '.jobs-description-content__text',
        '#job-details',
      ],
      "indeed.com": [
        '#jobDescriptionText',
      ],
    };
    for (const key of Object.keys(siteSelectors)) {
      if (!host.includes(key)) continue;
      for (const sel of siteSelectors[key]) {
        try {
          const el = document.querySelector(sel);
          if (el && text(el).length > 100) return text(el);
        } catch (_) {}
      }
    }
    // Structured data
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        const parsed = JSON.parse(s.textContent || "null");
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of arr) {
          if (node && node["@type"] === "JobPosting" && node.description) {
            const tmp = document.createElement("div");
            tmp.innerHTML = String(node.description);
            const t = (tmp.innerText || tmp.textContent || "").trim();
            if (t.length > 100) return t;
          }
        }
      }
    } catch (_) {}
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

  function cleanCompany(name) {
    if (!name) return "";
    let s = String(name).replace(/\s+/g, " ").trim();
    // Naukri / Glassdoor concatenate ratings+reviews after the name, e.g.
    // "Infosys3.549.8K Reviews" or "Google 4.5 12K Reviews".
    s = s.replace(/\d+(\.\d+)?\s*K?\+?\s*(Ratings?|Reviews?)\s*$/i, "").trim();
    // Strip trailing rating (e.g. "4.5", "4.5★", "3.5 stars").
    s = s.replace(/\s*[\d.]+\s*(★|stars?)?\s*$/i, "").trim();
    // Any leftover trailing digits glued to the name.
    s = s.replace(/\d+(\.\d+)?$/, "").trim();
    return s;
  }

  function scrape() {
    return {
      company: cleanCompany(guessCompany()),
      title: guessTitle(),
      url: location.href,
      description: guessDescription(),
    };
  }

  // ---------- UI --------------------------------------------------------

  const fab = document.createElement("button");
  fab.id = "jobforge-fab";
  const iconUrl = chrome.runtime.getURL("icon-32.png");
  fab.innerHTML = `<img src="${iconUrl}" alt="" /> Save to JobForge`;
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
      <div class="field"><label>Job description (preview)</label><textarea id="jf-desc" rows="6"></textarea></div>
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
    panel.querySelector("#jf-desc").value = data.description || "";
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
      description: panel.querySelector("#jf-desc").value.trim() || scrape().description,
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