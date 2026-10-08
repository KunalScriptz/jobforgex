// JobForge Extension Content Script
// Note: Host permissions ("<all_urls>") were removed from manifest.json for Chrome Web Store policy compliance.
// Script injection is declaratively scoped to job portals defined under content_scripts.matches.
(function () {
  if (window.__jobforgeInjected) return;
  window.__jobforgeInjected = true;

  const HOST_FALLBACK = "https://jobforgeapi.helixos.pro";
  const WEB_FALLBACK = "https://jobforge.helixos.pro";

  // Don't inject on the JobForge app itself.
  const selfHosts = [/^localhost$/i, /^127\.0\.0\.1$/i, /^0\.0\.0\.0$/i];
  if (selfHosts.some((r) => r.test(location.hostname))) return;

  // ---------- Scraping heuristics ---------------------------------------

  function text(el) { return (el && (el.innerText || el.textContent) || "").trim(); }
  function pickMeta(name) {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return el ? el.getAttribute("content") : "";
  }

  function guessTitle() {
    const host = location.hostname.replace(/^www\./, "");
    // Site-specific title selectors (JobStreet/SEEK expose the true job title
    // via data-automation; the page h1 is the search-results heading).
    if (host.includes("jobstreet.") || host.includes("seek.co")) {
      const el = document.querySelector('[data-automation="job-detail-title"], [data-automation="jobTitle"]');
      const v = el && text(el);
      if (v) return v;
    }
    // Structured data (JobPosting.title)
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
          if (n && n["@type"] === "JobPosting" && n.title) return String(n.title).trim();
        }
      }
    } catch (_) {}
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
    if (host.includes("jobstreet.") || host.includes("seek.co")) {
      const n = document.querySelector('[data-automation="advertiser-name"], [data-automation="job-detail-company"]');
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
    // Workable: apply.workable.com/<company-slug>/j/<id>/
    if (host.includes("workable.com")) {
      const wk = document.querySelector('[data-ui="company-name"], .styles--company, [class*="companyName"]');
      if (wk && text(wk)) return text(wk);
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

    function cleanDescriptionText(value) {
      let s = String(value || "")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      s = s.replace(/^About the job\s*/i, "").trim();
      s = s.replace(/\b(?:Show more|Show less|See more|See less)\b\s*$/i, "").trim();
      return s;
    }

    function goodDescription(value) {
      const s = cleanDescriptionText(value);
      if (s.length < 120) return "";
      // If this is the LinkedIn results/sidebar shell, it contains these list
      // markers before the real job text. Reject it instead of saving junk.
      if (/99\+ results/i.test(s) || /How promoted jobs are ranked/i.test(s) || /Selected,\s+/i.test(s)) return "";
      return s;
    }

    function findLinkedInAboutText() {
      // LinkedIn changes wrapper classes frequently. The stable visible anchor
      // is the "About the job" heading; choose the smallest container around it
      // that contains enough text, not the whole page/results list.
      const candidates = [];
      const nodes = Array.from(document.querySelectorAll("section, article, div"));
      for (const el of nodes) {
        const t = text(el);
        if (!/\bAbout the job\b/i.test(t) || t.length < 120) continue;
        const cleaned = goodDescription(t);
        if (!cleaned) continue;
        candidates.push({ el, cleaned, len: t.length });
      }
      candidates.sort((a, b) => a.len - b.len);
      return candidates[0]?.cleaned || "";
    }

    function tryExpandLinkedInDescription() {
      const buttons = Array.from(document.querySelectorAll("button, span[role='button']"));
      for (const btn of buttons) {
        const label = `${btn.getAttribute("aria-label") || ""} ${text(btn)}`;
        if (/show more|see more|more description/i.test(label)) {
          try { btn.click(); } catch (_) {}
        }
      }
    }

    if (host.includes("linkedin.com")) tryExpandLinkedInDescription();

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
        '#job-details',
        '.jobs-description__content',
        '.show-more-less-html__markup',
        '.description__text',
        'article.jobs-description__container .jobs-description-content__text',
        '.jobs-description-content__text--stretch',
        '.jobs-description__content .jobs-box__html-content',
        '.jobs-description-content__text',
        'article.jobs-description__container',
        '.jobs-description',
        '.jobs-box__html-content',
      ],
      "indeed.com": [
        '#jobDescriptionText',
      ],
      "jobstreet.": [
        '[data-automation="jobAdDetails"]',
        '[data-automation="jobDescription"]',
      ],
      "seek.co": [
        '[data-automation="jobAdDetails"]',
      ],
      "workable.com": [
        '[data-ui="job-description"]',
        '#job-description',
        '.job-description',
        'section[class*="description"]',
      ],
    };
    for (const key of Object.keys(siteSelectors)) {
      if (!host.includes(key)) continue;
      for (const sel of siteSelectors[key]) {
        try {
          const el = document.querySelector(sel);
          const v = el && goodDescription(text(el));
          if (v) return v;
        } catch (_) {}
      }
      // Site recognised but no JD panel is currently rendered
      // (e.g. LinkedIn search-results view with no job selected).
      // Do NOT fall back to <main>/<body> — that dumps the whole page.
      if (host.includes("linkedin.com")) return findLinkedInAboutText();
    }
    // Structured data (including JobPosting nested under a top-level @graph array,
    // which the site-specific selectors above can't see and which some ATS/self-hosted
    // career pages use instead of a flat JobPosting node).
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
        for (const node of nodes) {
          if (node && node["@type"] === "JobPosting" && node.description) {
            const tmp = document.createElement("div");
            tmp.innerHTML = String(node.description);
            const t = (tmp.innerText || tmp.textContent || "").trim();
            const cleaned = goodDescription(t);
            if (cleaned) return cleaned;
          }
        }
      }
    } catch (_) {}
    const metaDescription = goodDescription(pickMeta("og:description") || pickMeta("description"));
    if (metaDescription) return metaDescription;
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
      if (el) {
        const v = goodDescription(text(el));
        if (v) return v;
      }
    }
    return text(document.body).slice(0, 20000);
  }

  function guessLocation() {
    const host = location.hostname.replace(/^www\./, "");
    function cleanLocText(v) {
      if (!v) return "";
      let s = String(v).replace(/\s+/g, " ").trim();
      s = s.replace(/\b(?:Hybrid|On-site|Onsite|Remote|Full-time|Part-time|Contract|Internship)\b\s*$/i, "").trim();
      s = s.replace(/\s*\((?:Hybrid|On-site|Onsite|Remote)\)\s*$/i, "").trim();
      // LinkedIn primary-description looks like:
      //   "Singapore, Singapore · Reposted 4 hours ago · Over 100 people clicked apply"
      // Take the first bullet-separated chunk that actually looks like a location.
      const parts = s.split(/[·•|]/).map((p) => p.trim()).filter(Boolean);
      const bad = /(ago|applicant|apply|promoted|reposted|early|viewed|actively|hiring|posted|school alumni|works here|response insights|full[-\s]?time|part[-\s]?time|contract|internship|hybrid|on[-\s]?site|remote only)/i;
      for (const p of parts) {
        const cleaned = p
          .replace(/\s+(?:\d+\s+)?(?:minutes?|hours?|days?|weeks?|months?)\s+ago\b.*$/i, "")
          .replace(/\s+reposted\b.*$/i, "")
          .replace(/\s+\d+\s+applicants?\b.*$/i, "")
          .replace(/\s+over\s+\d+\s+people\b.*$/i, "")
          .replace(/\s+promoted\b.*$/i, "")
          .replace(/\s+no response insights\b.*$/i, "")
          .replace(/\s*\((?:Hybrid|On-site|Onsite|Remote)\)\s*$/i, "")
          .trim();
        if (cleaned && !bad.test(cleaned) && cleaned.length <= 80 && /[A-Za-z]/.test(cleaned)) return cleaned;
      }
      return parts[0] || s;
    }
    function looksLikeLocation(v) {
      const s = cleanLocText(v);
      if (!s || s.length > 80) return "";
      if (/^(hybrid|on[-\s]?site|onsite|remote|full[-\s]?time|part[-\s]?time|contract|internship)$/i.test(s)) return "";
      if (/(applicant|apply|ago|reposted|promoted|school alumni|works here|response insights|job poster|hiring team|premium|match details|tailor my resume)/i.test(s)) return "";
      // City/country formats, regions, or "Remote" with a country are OK.
      if (/,/.test(s) || /\b(remote|singapore|malaysia|india|indonesia|philippines|australia|new zealand|united states|united kingdom|canada|germany|france|netherlands|uae|dubai|bay area)\b/i.test(s)) return s;
      return "";
    }
    function linkedInLocationFromTopCard() {
      const topCard = document.querySelector(
        '.job-details-jobs-unified-top-card, .jobs-unified-top-card, .top-card-layout, .jobs-search__job-details--container'
      );
      const roots = topCard ? [topCard] : [document];
      const selectors = [
        '.job-details-jobs-unified-top-card__primary-description-container span',
        '.job-details-jobs-unified-top-card__tertiary-description-container span',
        '.job-details-jobs-unified-top-card__bullet',
        '.jobs-unified-top-card__primary-description span',
        '.jobs-unified-top-card__subtitle-primary-grouping span',
        '.jobs-unified-top-card__bullet',
        '.topcard__flavor--bullet',
        '.topcard__flavor.topcard__flavor--bullet',
        '[class*="primary-description"] span',
        '[class*="tertiary-description"] span',
      ];
      for (const root of roots) {
        for (const sel of selectors) {
          for (const el of Array.from(root.querySelectorAll(sel))) {
            const v = looksLikeLocation(text(el));
            if (v) return v;
          }
        }
        // Last LinkedIn fallback: inspect short visible chunks near the selected
        // top card. This catches text nodes whose wrapper class changed.
        for (const el of Array.from(root.querySelectorAll("span, div"))) {
          const raw = text(el);
          if (!raw || raw.length > 180) continue;
          const v = looksLikeLocation(raw);
          if (v) return v;
        }
      }
      return "";
    }
    if (host.includes("linkedin.com")) {
      const liLoc = linkedInLocationFromTopCard();
      if (liLoc) return liLoc;
    }
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
        '.job-details-jobs-unified-top-card__primary-description-container',
        '.job-details-jobs-unified-top-card__tertiary-description-container',
        '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
        '.jobs-unified-top-card__bullet',
        '.jobs-unified-top-card__primary-description',
        '.jobs-unified-top-card__subtitle-primary-grouping .jobs-unified-top-card__bullet',
        '.topcard__flavor--bullet',
        '.topcard__flavor.topcard__flavor--bullet',
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
      "jobstreet.":    ['[data-automation="job-detail-location"]', '[data-automation="job-location"]'],
      "seek.co":       ['[data-automation="job-detail-location"]'],
      "workable.com":  ['[data-ui="job-location"]', '[class*="location"]'],
    };
    for (const key of Object.keys(siteSelectors)) {
      if (!host.includes(key)) continue;
      for (const sel of siteSelectors[key]) {
        try {
          const el = document.querySelector(sel);
          const v = el && text(el);
          if (v) {
            const cleaned = cleanLocText(v);
            if (cleaned && cleaned.length < 120) return cleaned;
          }
        } catch (_) {}
      }
    }
    // 3. Generic attribute/class hints
    const generic = document.querySelector('[data-testid*="location" i], [class*="jobLocation" i], [class*="job-location" i]');
    if (generic && text(generic)) {
      const v = cleanLocText(text(generic));
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
      <div class="field"><label>Company</label><input id="jf-company" name="jf-company" autocomplete="on" /></div>
      <div class="field"><label>Title</label><input id="jf-title" name="jf-title" autocomplete="on" /></div>
      <div class="field"><label>Location</label><input id="jf-location" name="jf-location" autocomplete="on" list="jf-location-list" placeholder="e.g. Remote · Bengaluru, IN" /></div>
      <datalist id="jf-location-list"></datalist>
      <div class="field"><label>URL</label><input id="jf-url" name="jf-url" /></div>
      <div class="field"><label>Job description (preview)</label><textarea id="jf-desc" rows="6"></textarea></div>
      <div class="actions">
        <button id="jf-save">Save to board</button>
        <button id="jf-autofill" class="secondary" title="Fill matching fields on this page from your JobForge profile">Autofill</button>
      </div>
      <div class="status" id="jf-status"></div>
    `;
    document.documentElement.appendChild(panel);
    panel.querySelector("#jf-company").value = data.company;
    panel.querySelector("#jf-title").value = data.title;
    panel.querySelector("#jf-location").value = data.location || "";
    panel.querySelector("#jf-url").value = data.url;
    panel.querySelector("#jf-desc").value = data.description || "";
    // Populate location suggestions: prior saves + a seeded list of common
    // job locations so suggestions show up even on first use / when the
    // scraper failed to detect a location. The <datalist> filters as the
    // user types.
    const SEED_LOCATIONS = [
      "Remote", "Remote, India", "Remote, US", "Remote, EU", "Hybrid",
      "Bengaluru, IN", "Bangalore, IN", "Hyderabad, IN", "Chennai, IN",
      "Mumbai, IN", "Pune, IN", "Delhi, IN", "Gurgaon, IN", "Noida, IN",
      "Kolkata, IN", "Ahmedabad, IN", "Kochi, IN",
      "Singapore", "Kuala Lumpur, MY", "Penang, MY", "Johor Bahru, MY",
      "Jakarta, ID", "Manila, PH", "Bangkok, TH", "Ho Chi Minh City, VN",
      "Hong Kong", "Tokyo, JP", "Seoul, KR", "Shanghai, CN", "Beijing, CN",
      "Sydney, AU", "Melbourne, AU",
      "London, UK", "Manchester, UK", "Dublin, IE",
      "Berlin, DE", "Munich, DE", "Amsterdam, NL", "Paris, FR",
      "Zurich, CH", "Stockholm, SE", "Madrid, ES", "Barcelona, ES",
      "New York, NY", "San Francisco, CA", "Seattle, WA", "Austin, TX",
      "Boston, MA", "Chicago, IL", "Los Angeles, CA", "Denver, CO",
      "Toronto, CA", "Vancouver, CA",
      "Dubai, AE", "Abu Dhabi, AE", "Riyadh, SA", "Tel Aviv, IL",
    ];
    const renderLocationOptions = (values) => {
      const dl = panel.querySelector("#jf-location-list");
      if (!dl) return;
      const seen = new Set();
      const merged = [];
      for (const v of values) {
        const s = String(v || "").trim();
        const k = s.toLowerCase();
        if (s && !seen.has(k)) { seen.add(k); merged.push(s); }
      }
      dl.innerHTML = merged
        .map((v) => `<option value="${v.replace(/"/g, "&quot;")}"></option>`)
        .join("");
    };
    try {
      chrome.storage.local.get(["jf_recent_locations"], (r) => {
        const list = Array.isArray(r.jf_recent_locations) ? r.jf_recent_locations : [];
        renderLocationOptions([...list, ...SEED_LOCATIONS]);
      });
    } catch (_) {
      renderLocationOptions(SEED_LOCATIONS);
    }
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
        const res = await fetch(`${host}/api/v1/extension/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          showSavedScreen(host, "Wishlist");
          // Remember this location for future suggestions.
          if (payload.location) {
            try {
              chrome.storage.local.get(["jf_recent_locations"], (r) => {
                const prev = Array.isArray(r.jf_recent_locations) ? r.jf_recent_locations : [];
                const next = [payload.location, ...prev.filter((v) => v !== payload.location)].slice(0, 25);
                chrome.storage.local.set({ jf_recent_locations: next });
              });
            } catch (_) {}
          }
        }
        else if (res.status === 401) status("Token rejected — reconnect.", "err");
        else status(`Save failed (${res.status})`, "err");
      } catch (e) { status(e.message, "err"); }
    });
  }

  function showSavedScreen(host, listName) {
    if (!panel) return;
    const webHost = host.includes("jobforgeapi") ? host.replace("jobforgeapi.", "jobforge.") : host;
    panel.innerHTML = `
      <button class="close" title="Close">×</button>
      <div style="text-align:center; padding: 18px 8px 8px;">
        <div style="font-size:12px; color:#64748b; margin-bottom:6px;">Your job was saved to</div>
        <div style="font-size:26px; font-weight:800; color:#0f172a; margin-bottom:14px;">${listName}</div>
        <a id="jf-open" href="${webHost}/jobs" target="_blank"
           style="display:inline-block; background:#0f172a; color:white; text-decoration:none;
                  padding:9px 18px; border-radius:999px; font-weight:600; font-size:12px;">
          Open in JobForge
        </a>
      </div>
    `;
    panel.querySelector(".close").addEventListener("click", () => { panel.remove(); panel = null; });
  }

  // ---------- Autofill ---------------------------------------------------
  // Best-effort: matches visible text/email/tel/url/textarea fields against a
  // keyword table built from each field's id/name/label/aria-label/placeholder,
  // and fills whatever it recognizes from the user's JobForge profile. This is
  // a heuristic pass across many unrelated ATS sites, not a guaranteed 100% match.

  const AUTOFILL_FIELD_MATCHERS = [
    { key: "linkedin_url", test: /linkedin/i },
    { key: "portfolio_url", test: /portfolio|personal\s*website|website\s*url|\bgithub\b/i },
    { key: "email", test: /e[-\s]?mail/i },
    { key: "phone", test: /phone|mobile|contact\s*number|telephone/i },
    { key: "current_title", test: /current\s*(job\s*)?title|job\s*title|current\s*position|current\s*role/i },
    { key: "current_company", test: /current\s*employer|current\s*company|employer\s*name|company\s*name/i },
    { key: "full_name", test: /\b(full\s*name|your\s*name|applicant\s*name|candidate\s*name|legal\s*name)\b|^name$/i },
    { key: "location", test: /\b(location|city|current\s*address|based\s*in)\b/i },
  ];

  function fieldSignature(el) {
    const parts = [];
    if (el.id) {
      parts.push(el.id);
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) parts.push(text(lbl));
      } catch (_) {}
    }
    if (el.name) parts.push(el.name);
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) parts.push(ariaLabel);
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const n = document.getElementById(id);
        if (n) parts.push(text(n));
      }
    }
    if (el.placeholder) parts.push(el.placeholder);
    const wrapLabel = el.closest("label");
    if (wrapLabel) parts.push(text(wrapLabel));
    return parts.join(" ").trim();
  }

  function matchAutofillKey(el) {
    const sig = fieldSignature(el);
    if (!sig) return null;
    for (const { key, test } of AUTOFILL_FIELD_MATCHERS) {
      if (test.test(sig)) return key;
    }
    return null;
  }

  function setNativeValue(el, value) {
    // React (and most modern ATS forms) track input via the native setter, not
    // the DOM attribute — assigning el.value directly leaves their state stale.
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value") && Object.getOwnPropertyDescriptor(proto, "value").set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function tryAutofill() {
    status("Loading your profile…");
    chrome.storage.local.get(["host", "token"], async (cfg) => {
      const host = (cfg.host || HOST_FALLBACK).replace(/\/$/, "");
      const token = cfg.token;
      if (!token) { status("Open the extension popup and paste your token.", "err"); return; }

      let profile;
      try {
        const res = await fetch(`${host}/api/v1/extension/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) { status("Token rejected — reconnect.", "err"); return; }
        if (!res.ok) { status(`Couldn't load profile (${res.status}).`, "err"); return; }
        profile = await res.json();
      } catch (e) { status(e.message, "err"); return; }

      const candidates = Array.from(
        document.querySelectorAll(
          'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea'
        )
      ).filter((el) => el.offsetParent !== null && !el.disabled && !el.readOnly && !el.closest("#jobforge-panel"));

      let filled = 0;
      let matched = 0;
      for (const el of candidates) {
        const key = matchAutofillKey(el);
        if (!key) continue;
        const value = profile[key];
        if (!value) continue;
        matched++;
        if (el.value && el.value.trim()) continue; // don't clobber what the user already typed
        setNativeValue(el, value);
        filled++;
      }

      if (filled === 0) {
        status(matched > 0 ? "Matching fields already had values." : "No matching fields detected on this page.", "err");
      } else {
        status(`Filled ${filled} field${filled === 1 ? "" : "s"} — please double-check before submitting.`, "ok");
      }
    });
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