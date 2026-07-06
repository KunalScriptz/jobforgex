// Render a structured resume JSON into a compilable LaTeX document that
// uses the same custom commands and preamble as the JobForge base template.

export type BuilderContent = {
  target_title?: string;
  contact?: {
    name?: string; email?: string; phone?: string; location?: string;
    linkedin?: string; github?: string; website?: string;
  };
  about?: string;
  work?: Array<{ company?: string; title?: string; location?: string; start?: string; end?: string; bullets?: string[] }>;
  education?: Array<{ school?: string; degree?: string; field?: string; start?: string; end?: string; details?: string[] }>;
  skills?: Array<{ group?: string; items?: string[] }>;
  projects?: Array<{ name?: string; link?: string; bullets?: string[] }>;
  certifications?: Array<{ name?: string; issuer?: string; date?: string }>;
  links?: Array<{ label?: string; url?: string }>;
  volunteer?: Array<{ org?: string; role?: string; start?: string; end?: string; bullets?: string[] }>;
  section_order?: string[];
};

// Escape LaTeX-special characters inside prose. Leaves already-escaped text alone.
export function escLatex(s: string | undefined | null): string {
  if (!s) return "";
  return String(s)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function urlEsc(s: string | undefined | null): string {
  if (!s) return "";
  return String(s).replace(/([%#])/g, "\\$1").replace(/\\/g, "/");
}

function nonEmpty<T>(a: T[] | undefined): T[] { return (a ?? []).filter(Boolean); }

function renderHeader(c: BuilderContent, primary: string, secondary: string): string {
  const contact = c.contact ?? {};
  const name = escLatex(contact.name || "Your Name").toUpperCase();
  const parts: string[] = [];
  if (contact.phone) {
    parts.push(`\\faMobile \\hspace{.5pt} \\href{tel:${urlEsc(contact.phone)}}{${escLatex(contact.phone)}}`);
  }
  if (contact.email) {
    parts.push(`\\faAt \\hspace{.5pt} \\href{mailto:${urlEsc(contact.email)}}{${escLatex(contact.email)}}`);
  }
  if (contact.linkedin) {
    const url = contact.linkedin.startsWith("http") ? contact.linkedin : `https://www.linkedin.com/in/${contact.linkedin}/`;
    parts.push(`\\faLinkedinSquare \\hspace{.5pt} \\href{${urlEsc(url)}}{LinkedIn}`);
  }
  if (contact.github) {
    const url = contact.github.startsWith("http") ? contact.github : `https://github.com/${contact.github}`;
    parts.push(`\\faGithub \\hspace{.5pt} \\href{${urlEsc(url)}}{GitHub}`);
  }
  if (contact.website) {
    parts.push(`\\faGlobe \\hspace{.5pt} \\href{${urlEsc(contact.website)}}{Website}`);
  }
  if (contact.location) {
    parts.push(`\\faMapMarker \\hspace{.5pt} {${escLatex(contact.location)}}`);
  }
  const joined = parts.join("\n  $|$\n  ");
  return `\\begin{center}
  \\textbf{\\Huge \\scshape \\color{darkturquoise} ${name}} \\\\ \\vspace{3pt}
  \\small
  ${joined}
\\end{center}`;
}

function renderAbout(c: BuilderContent): string {
  if (!c.about?.trim()) return "";
  return `\\section{Professional Summary}
\\noindent ${escLatex(c.about)}`;
}

function renderSkills(c: BuilderContent): string {
  const groups = nonEmpty(c.skills).filter(g => (g.items ?? []).length);
  if (!groups.length) return "";
  const lines = groups.map(g => {
    const items = (g.items ?? []).map(escLatex).join(", ");
    return `      \\textbf{\\color{darkblue}${escLatex(g.group || "Skills")}}{: ${items}}`;
  }).join(" \\\\\n");
  return `\\section{Technical Skills}
\\begin{itemize}[leftmargin=0.15in, label={}]
  \\small{\\item{
${lines}
  }}
\\end{itemize}`;
}

function renderWork(c: BuilderContent): string {
  const items = nonEmpty(c.work);
  if (!items.length) return "";
  const body = items.map(w => {
    const dates = [w.start, w.end || (w.start ? "Present" : "")].filter(Boolean).join(" -- ");
    const bullets = nonEmpty(w.bullets).map(b => `        \\resumeItem{${escLatex(b)}}`).join("\n");
    const bulletBlock = bullets ? `      \\resumeItemListStart\n${bullets}\n      \\resumeItemListEnd` : "";
    return `    \\resumeSubheading
      {${escLatex(w.title || "")}}{${escLatex(dates)}}
      {${escLatex(w.company || "")}}{${escLatex(w.location || "")}}
${bulletBlock}`;
  }).join("\n");
  return `\\section{Experience}
  \\resumeSubHeadingListStart
${body}
  \\resumeSubHeadingListEnd`;
}

function renderProjects(c: BuilderContent): string {
  const items = nonEmpty(c.projects);
  if (!items.length) return "";
  const body = items.map(p => {
    const bullets = nonEmpty(p.bullets).map(b => `        \\resumeItem{${escLatex(b)}}`).join("\n");
    const bulletBlock = bullets ? `      \\resumeItemListStart\n${bullets}\n      \\resumeItemListEnd` : "";
    const link = p.link ? ` $|$ \\href{${urlEsc(p.link)}}{link}` : "";
    return `    \\resumeProjectHeading
      {\\textbf{\\color{darkblue}${escLatex(p.name || "")}}${link}}{}
${bulletBlock}`;
  }).join("\n");
  return `\\section{Projects}
  \\resumeSubHeadingListStart
${body}
  \\resumeSubHeadingListEnd`;
}

function renderEducation(c: BuilderContent): string {
  const items = nonEmpty(c.education);
  if (!items.length) return "";
  const body = items.map(e => {
    const dates = [e.start, e.end].filter(Boolean).join(" -- ");
    const degreeLine = [e.degree, e.field].filter(Boolean).map(escLatex).join(", ");
    return `    \\resumeSubheading
      {${escLatex(e.school || "")}}{${escLatex(dates)}}
      {${degreeLine}}{}`;
  }).join("\n");
  return `\\section{Education}
  \\resumeSubHeadingListStart
${body}
  \\resumeSubHeadingListEnd`;
}

function renderCertifications(c: BuilderContent): string {
  const items = nonEmpty(c.certifications);
  if (!items.length) return "";
  const body = items.map(cert => {
    const bits = [cert.issuer, cert.name, cert.date].filter(Boolean).map(escLatex);
    const line = bits.length >= 2
      ? `\\textbf{\\color{darkblue}${bits[0]}} $|$ ${bits.slice(1).join(" $|$ ")}`
      : bits.join("");
    return `      \\resumeItem{${line}}`;
  }).join("\n");
  return `\\section{Certifications}
  \\resumeSubHeadingListStart
${body}
  \\resumeSubHeadingListEnd`;
}

function renderVolunteer(c: BuilderContent): string {
  const items = nonEmpty(c.volunteer);
  if (!items.length) return "";
  const body = items.map(v => {
    const dates = [v.start, v.end].filter(Boolean).join(" -- ");
    const bullets = nonEmpty(v.bullets).map(b => `        \\resumeItem{${escLatex(b)}}`).join("\n");
    const bulletBlock = bullets ? `      \\resumeItemListStart\n${bullets}\n      \\resumeItemListEnd` : "";
    return `    \\resumeSubheading
      {${escLatex(v.role || "")}}{${escLatex(dates)}}
      {${escLatex(v.org || "")}}{}
${bulletBlock}`;
  }).join("\n");
  return `\\section{Volunteer Experience}
  \\resumeSubHeadingListStart
${body}
  \\resumeSubHeadingListEnd`;
}

function renderLinks(c: BuilderContent): string {
  const items = nonEmpty(c.links);
  if (!items.length) return "";
  const body = items.map(l =>
    `      \\resumeItem{\\textbf{\\color{darkblue}${escLatex(l.label || "")}} $|$ \\href{${urlEsc(l.url || "")}}{${escLatex(l.url || "")}}}`
  ).join("\n");
  return `\\section{Links}
  \\resumeSubHeadingListStart
${body}
  \\resumeSubHeadingListEnd`;
}

const RENDERERS: Record<string, (c: BuilderContent) => string> = {
  about: renderAbout,
  skills: renderSkills,
  work: renderWork,
  projects: renderProjects,
  education: renderEducation,
  certifications: renderCertifications,
  volunteer: renderVolunteer,
  links: renderLinks,
};

const DEFAULT_ORDER = ["about", "skills", "work", "projects", "education", "certifications", "volunteer", "links"];

export function renderBuilderLatex(
  content: BuilderContent,
  opts: { primary_color?: string; secondary_color?: string } = {},
): string {
  const primary = opts.primary_color ?? "0.0,0.65,0.60";
  const secondary = opts.secondary_color ?? "0.0,0.0,0.55";
  const order = (content.section_order && content.section_order.length ? content.section_order : DEFAULT_ORDER)
    .filter(k => RENDERERS[k]);
  const sections = order.map(k => RENDERERS[k](content)).filter(Boolean).join("\n\n");
  const header = renderHeader(content, primary, secondary);

  return `\\documentclass[letterpaper,11pt]{article}

\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\usepackage{fontawesome}
\\input{glyphtounicode}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}

\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

\\definecolor{darkturquoise}{rgb}{${primary}}
\\definecolor{darkblue}{rgb}{${secondary}}

\\titleformat{\\section}{
  \\vspace{-4pt}\\scshape\\raggedright\\large\\bfseries\\color{darkturquoise}
}{}{0em}{}[\\color{darkturquoise}\\titlerule \\vspace{-5pt}]

\\pdfgentounicode=1

\\newcommand{\\resumeItem}[1]{\\item\\small{{#1 \\vspace{-2pt}}}}
\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-2pt}\\item
  \\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{\\color{darkblue}#1} & #2 \\\\
    \\textit{\\small#3} & \\textit{\\small #4} \\\\
  \\end{tabular*}\\vspace{-7pt}
}
\\newcommand{\\resumeProjectHeading}[2]{
  \\item
  \\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}
    \\small#1 & #2 \\\\
  \\end{tabular*}\\vspace{-7pt}
}
\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}

\\begin{document}

${header}

${sections}

\\end{document}
`;
}

// -------- JSON-patch helpers used by "Apply suggestion" --------

export function applyPatch(content: BuilderContent, patch: { path: string; op: "set" | "append"; value: any }): BuilderContent {
  const next = structuredClone(content) as any;
  const parts = patch.path.split(".");
  let cur: any = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const idx = /^\d+$/.test(key) ? Number(key) : key;
    if (cur[idx] == null) cur[idx] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[idx];
  }
  const last = parts[parts.length - 1];
  const lastIdx = /^\d+$/.test(last) ? Number(last) : last;
  if (patch.op === "append") {
    if (!Array.isArray(cur[lastIdx])) cur[lastIdx] = [];
    if (Array.isArray(patch.value)) cur[lastIdx].push(...patch.value);
    else cur[lastIdx].push(patch.value);
  } else {
    cur[lastIdx] = patch.value;
  }
  return next;
}