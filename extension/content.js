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

  function guessLocation() {
    const host = location.hostname.replace(/^www\./, "");
    // 1. Structured data (JobPosting.jobLocation)
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        const parsed = JSON.parse(s.textContent || "null");
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const nodes = [];
        for (const n of arr) {
          if (!n) continue;
          nodes.push(n);
          if (Array.isArray(n["@graph"])) nodes.push(...n["@graph"]);
        }
        for (const n of nodes) {
          if (n && n["@type"] === "JobPosting") {
            if (n.jobLocationType && /telecommute|remote/i.test(String(n.jobLocationType))) return "Remote";
            const locs = Array.isArray(n.jobLocation) ? n.jobLocation : (n.jobLocation ? [n.jobLocation] : []);
            for (const loc of locs) {
              if (typeof loc === "string" && loc.trim()) return loc.trim();
              const a = loc && loc.address;
              if (a) {
                if (typeof a === "string") return a.trim();
                const parts = [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean);
                if (parts.length) return parts.join(", ");
              }
            }
          }
        }
      }
    } catch (_) {}
    // 2. Site-specific selectors
    const siteSelectors = {
      "linkedin.com": [
        '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
        '.jobs-unified-top-card__bullet',
        '.topcard__flavor--bullet',
      ],
      "indeed.com": [
        '[data-testid="inlineHeader-companyLocation"]',
        '[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
      ],
      "glassdoor.": [
        '[data-test="location"]',
        '[class*="JobDetails_location"]',
      ],
      "naukri.com": [
        '.styles_jhc__location__W_pVs a',
        '.loc a',
        '[class*="location"] a',
      ],
      "greenhouse.io": ['.location', '.job__location', '[class*="location"]'],
      "lever.co":      ['.location', '.posting-categories .location', '[class*="location"]'],
      "ashbyhq.com":   ['[class*="location"]'],
    };
    for (const key of Object.keys(siteSelectors)) {
      if (!host.includes(key)) continue;
      for (const sel of siteSelectors[key]) {
        try {
          const el = document.querySelector(sel);
          const v = el && text(el);
          if (v && v.length < 120) return v.replace(/\s+/g, " ").trim();
        } catch (_) {}
      }
    }
    // 3. Generic attribute/class hints
    const generic = document.querySelector('[data-testid*="location" i], [class*="jobLocation" i], [class*="job-location" i]');
    if (generic && text(generic)) {
      const v = text(generic).replace(/\s+/g, " ").trim();
      if (v.length < 120) return v;
    }
    return "";
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
      location: guessLocation(),
    };
  }

  // ---------- UI --------------------------------------------------------

  const fab = document.createElement("button");
  fab.id = "jobforge-fab";
  const iconUrl = chrome.runtime.getURL("icon-32.png");
  fab.innerHTML = `<img src="${iconUrl}" alt="" /> Save to JobForge`;
  document.documentElement.appendChild(fab);

  // Default position: bottom-right. Restore per-site override if present.
  const POS_KEY = "jobforge_fab_pos_v1";
  requestAnimationFrame(() => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(POS_KEY) || "null"); } catch (_) {}
    if (saved && typeof saved.left === "number" && typeof saved.top === "number") {
      applyPos(saved.left, saved.top);
    } else {
      applyPos(window.innerWidth - fab.offsetWidth - 24, window.innerHeight - fab.offsetHeight - 24);
    }
  });

  function applyPos(left, top) {
    const maxL = Math.max(0, window.innerWidth - fab.offsetWidth - 4);
    const maxT = Math.max(0, window.innerHeight - fab.offsetHeight - 4);
    const l = Math.min(Math.max(0, left), maxL);
    const t = Math.min(Math.max(0, top), maxT);
    // Use setProperty with 'important' so we override the !important defaults
    // (inline styles otherwise lose to stylesheet !important rules).
    fab.style.setProperty("left", l + "px", "important");
    fab.style.setProperty("top", t + "px", "important");
    fab.style.setProperty("right", "auto", "important");
    fab.style.setProperty("bottom", "auto", "important");
    if (panel) positionPanel();
  }

  // Drag handling — treat as drag only if pointer moved > 5px.
  let dragging = false;
  let didDrag = false;
  let startX = 0, startY = 0, startL = 0, startT = 0;
  fab.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    didDrag = false;
    const rect = fab.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startL = rect.left; startT = rect.top;
    fab.setPointerCapture(e.pointerId);
  });
  fab.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!didDrag && Math.hypot(dx, dy) < 5) return;
    didDrag = true;
    applyPos(startL + dx, startT + dy);
  });
  fab.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    try { fab.releasePointerCapture(e.pointerId); } catch (_) {}
    if (didDrag) {
      const rect = fab.getBoundingClientRect();
      try { localStorage.setItem(POS_KEY, JSON.stringify({ left: rect.left, top: rect.top })); } catch (_) {}
    }
  });

  let panel = null;
  fab.addEventListener("click", () => {
    if (didDrag) { didDrag = false; return; }
    if (panel) { panel.remove(); panel = null; return; }
    openPanel();
  });

  function positionPanel() {
    if (!panel) return;
    const rect = fab.getBoundingClientRect();
    const panelW = 340;
    const panelH = Math.min(window.innerHeight - 40, 520);
    // Prefer opening above the fab; flip below if not enough room.
    let top = rect.top - panelH - 10;
    if (top < 10) top = rect.bottom + 10;
    let left = rect.left + rect.width / 2 - panelW / 2;
    left = Math.min(Math.max(8, left), window.innerWidth - panelW - 8);
    panel.style.setProperty("left", left + "px", "important");
    panel.style.setProperty("top", top + "px", "important");
    panel.style.setProperty("right", "auto", "important");
    panel.style.setProperty("bottom", "auto", "important");
  }

  function openPanel() {
    const data = scrape();
    panel = document.createElement("div");
    panel.id = "jobforge-panel";
    panel.innerHTML = `
      <button class="close" title="Close">×</button>
      <h3>Save this job</h3>
      <div class="field"><label>Company</label><input id="jf-company" /></div>
      <div class="field"><label>Title</label><input id="jf-title" /></div>
      <div class="field"><label>Location</label><input id="jf-location" placeholder="e.g. Remote · Bengaluru, IN" /></div>
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
    panel.querySelector("#jf-location").value = data.location || "";
    panel.querySelector("#jf-url").value = data.url;
    panel.querySelector("#jf-desc").value = data.description || "";
    panel.querySelector(".close").addEventListener("click", () => { panel.remove(); panel = null; });
    panel.querySelector("#jf-save").addEventListener("click", saveJob);
    panel.querySelector("#jf-autofill").addEventListener("click", tryAutofill);
    positionPanel();
  }

  function status(text, cls) {
    const el = panel && panel.querySelector("#jf-status");
    if (el) { el.textContent = text; el.className = "status " + (cls || ""); }
  }

  async function saveJob() {
    const payload = {
      company: panel.querySelector("#jf-company").value.trim(),
      title: panel.querySelector("#jf-title").value.trim(),
      location: panel.querySelector("#jf-location").value.trim(),
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
        if (res.ok) {
          showSavedScreen(host, "Wishlist");
        }
        else if (res.status === 401) status("Token rejected — reconnect.", "err");
        else status(`Save failed (${res.status})`, "err");
      } catch (e) { status(e.message, "err"); }
    });
  }

  function showSavedScreen(host, listName) {
    if (!panel) return;
    panel.innerHTML = `
      <button class="close" title="Close">×</button>
      <div style="text-align:center; padding: 18px 8px 8px;">
        <div style="font-size:12px; color:#64748b; margin-bottom:6px;">Your job was saved to</div>
        <div style="font-size:26px; font-weight:800; color:#0f172a; margin-bottom:14px;">${listName}</div>
        <a id="jf-open" href="${host}/jobs" target="_blank"
           style="display:inline-block; background:#0f172a; color:white; text-decoration:none;
                  padding:9px 18px; border-radius:999px; font-weight:600; font-size:12px;">
          Open in JobForge
        </a>
      </div>
    `;
    panel.querySelector(".close").addEventListener("click", () => { panel.remove(); panel = null; });
  }

  // Basic label/name-based autofill — populates common application fields
  // from data pulled from the JobForge profile (future enhancement).
  function tryAutofill() {
    status("Autofill coming soon — profile fields are being built.", "err");
  }

  // ---------- Version check --------------------------------------------
  // Once per 6 hours, hit /extension-version.json. If newer, show a
  // top-right toast with a one-click "Download update" link.
  async function checkForUpdate() {
    try {
      const LAST = "jobforge_version_check_v1";
      const now = Date.now();
      const last = Number(localStorage.getItem(LAST) || 0);
      if (now - last < 6 * 60 * 60 * 1000) return;
      localStorage.setItem(LAST, String(now));
      const cfg = await new Promise((r) => chrome.storage.local.get(["host"], r));
      const host = (cfg.host || HOST_FALLBACK).replace(/\/$/, "");
      const res = await fetch(`${host}/extension-version.json`, { cache: "no-store" });
      if (!res.ok) return;
      const info = await res.json();
      const current = chrome.runtime.getManifest().version;
      if (!info.version || info.version === current) return;
      if (cmpVersion(info.version, current) <= 0) return;
      showUpdateToast(info.version, info.download || `${host}/jobforge-extension.zip`);
    } catch (_) {}
  }
  function cmpVersion(a, b) {
    const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
  }
  function showUpdateToast(version, downloadUrl) {
    const t = document.createElement("div");
    t.id = "jobforge-update-toast";
    Object.assign(t.style, {
      position: "fixed", top: "16px", right: "16px", zIndex: "2147483647",
      background: "#0f172a", color: "white", padding: "12px 14px", borderRadius: "10px",
      boxShadow: "0 10px 30px rgba(15,23,42,.35)", font: "13px system-ui, -apple-system, sans-serif",
      maxWidth: "300px", display: "flex", flexDirection: "column", gap: "8px",
    });
    t.innerHTML = `
      <div style="font-weight:600;">JobForge update available</div>
      <div style="font-size:12px; opacity:.85;">Version ${version} is ready. Download and drag the new folder onto chrome://extensions.</div>
      <div style="display:flex; gap:6px;">
        <a href="${downloadUrl}" target="_blank" style="flex:1; text-align:center; background:white; color:#0f172a; text-decoration:none; padding:6px 10px; border-radius:6px; font-weight:600; font-size:12px;">Download</a>
        <button id="jf-upd-dismiss" style="background:transparent; color:white; border:1px solid rgba(255,255,255,.3); padding:6px 10px; border-radius:6px; cursor:pointer; font-size:12px;">Later</button>
      </div>
    `;
    document.documentElement.appendChild(t);
    t.querySelector("#jf-upd-dismiss").addEventListener("click", () => t.remove());
    setTimeout(() => t.remove(), 20000);
  }
  checkForUpdate();
})();