import os
import re
import structlog
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.builder_resume import BuilderResume, BuilderResumeVersion
from app.services import resumes as resumes_service

logger = structlog.get_logger()

# The reference skeleton is `backend/config/resume-template.tex` (dev) or `./config/resume-template.tex`
# (Docker mount). Mirror services/ai::PROMPTS_PATHS so both environments resolve it.
TEMPLATE_PATHS = [
    Path(__file__).parent.parent.parent / "config" / "resume-template.tex",
    Path(os.getcwd()) / "config" / "resume-template.tex",
]

DEFAULT_PRIMARY = "0.0,0.65,0.60"     # darkturquoise
DEFAULT_SECONDARY = "0.0,0.0,0.55"    # darkblue

# Field names that compose the resume header, in display order.
CONTACT_FIELDS = ["phone", "email", "linkedin", "github", "website", "location"]

# Canonical section order used when content.section_order is absent.
DEFAULT_SECTION_ORDER = [
    "about", "skills", "work", "projects", "education", "certifications", "links", "volunteer",
]


def _read_config_template() -> str:
    for path in TEMPLATE_PATHS:
        if path.exists():
            return path.read_text()
    return ""


def _hex_to_rgb_tuple(hex_value: str | None) -> str:
    if not hex_value:
        return DEFAULT_PRIMARY
    m = hex_value.replace("#", "")
    if len(m) != 6:
        return DEFAULT_PRIMARY
    try:
        r = int(m[0:2], 16) / 255
        g = int(m[2:4], 16) / 255
        b = int(m[4:6], 16) / 255
    except ValueError:
        return DEFAULT_PRIMARY
    return f"{r:.2f},{g:.2f},{b:.2f}"


def latex_escape(s: str) -> str:
    """Escape LaTeX-unsafe characters in free text. Leave macro scaffolding untouched."""
    if not s:
        return ""
    # Order matters: escape backslash first so we don't re-escape generated macros.
    s = s.replace("\\", "\\textbackslash{}")
    for ch, rep in [
        ("&", "\\&"), ("%", "\\%"), ("$", "\\$"), ("#", "\\#"), ("_", "\\_"),
        ("{", "\\{"), ("}", "\\}"), ("~", "\\textasciitilde{}"), ("^", "\\textasciicircum{}"),
    ]:
        s = s.replace(ch, rep)
    return s


def _strip_inline(s: str) -> str:
    """Collapse LaTeX inline decoration to plain text for parsing."""
    s = re.sub(r"\\textbf\{", "", s)
    s = re.sub(r"\\emph\{", "", s)
    s = re.sub(r"\\textit\{", "", s)
    s = re.sub(r"\\href\{[^}]*\}\{", "", s)
    s = re.sub(r"\\color\{[^}]*\}", "", s)
    s = re.sub(r"\\scshape", "", s)
    s = s.replace("$|$", "|")
    # Drop balanced braces that wrapped the last replacement target.
    s = s.replace("{", "").replace("}", "")
    s = re.sub(r"\\[a-zA-Z@]*", "", s)
    s = s.replace("\\", "")
    return re.sub(r"\s+", " ", s).strip()


def render_latex_from_content(content: dict, primary_color: str, secondary_color: str) -> str:
    """Deterministic LaTeX emitter from structured content, using the JobForge skeleton macros."""
    template = _read_config_template()
    primary = primary_color or DEFAULT_PRIMARY
    secondary = secondary_color or DEFAULT_SECONDARY

    # Build preamble: lines between \documentclass and \begin{document}, with interpolated colors.
    if template:
        start = template.find("\\documentclass")
        end = template.find("\\begin{document}")
        preamble = template[start:end] if start != -1 and end != -1 else ""
        preamble = preamble.replace("0.0, 0.65, 0.60", primary).replace("0.0, 0.0, 0.55", secondary)
    else:
        preamble = make_fallback_preamble(primary, secondary)

    body = [
        "\\begin{center}",
        f"  \\textbf{{\\Huge \\scshape \\color{{darkturquoise}} {latex_escape(content.get('contact', {}).get('name') or 'Your Name')}}} \\\\ \\vspace{{3pt}}",
        "  \\small",
    ]
    header_parts = _render_header_parts(content.get("contact") or {})
    if header_parts:
        body.append("  " + " $|$\n  ".join(header_parts))
    body.append("\\end{center}")

    order = content.get("section_order") or DEFAULT_SECTION_ORDER
    for section in order:
        rendered = _render_section(section, content)
        if rendered:
            body.append(rendered)

    body.append("\\end{document}")
    return preamble + "\n\n" + "\n\n".join(body)


def make_fallback_preamble(primary: str, secondary: str) -> str:
    # Minimal preamble usable when the skeleton file is unavailable.
    return (
        "\\documentclass[letterpaper,11pt]{article}\n"
        "\\usepackage[empty]{fullpage}\n"
        "\\usepackage{titlesec}\n"
        "\\usepackage[usenames,dvipsnames]{color}\n"
        "\\usepackage{enumitem}\n"
        "\\usepackage[hidelinks]{hyperref}\n"
        "\\usepackage{fontawesome}\n"
        "\\usepackage{tabularx}\n"
        "\\input{glyphtounicode}\n"
        f"\\definecolor{{darkturquoise}}{{rgb}}{{{primary}}}\n"
        f"\\definecolor{{darkblue}}{{rgb}}{{{secondary}}}\n"
        "\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large\\bfseries\\color{darkturquoise}}{}{0em}{}[\\color{darkturquoise}\\titlerule \\vspace{-5pt}]\n"
        "\\newcommand{\\resumeItem}[1]{\\item\\small{{#1 \\vspace{-2pt}}}}\n"
        "\\newcommand{\\resumeSubheading}[4]{\\vspace{-2pt}\\item\\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}\\textbf{\\color{darkblue}#1} & #2 \\\\ \\textit{\\small#3} & \\textit{\\small #4} \\\\ \\end{tabular*}\\vspace{-7pt}}\n"
        "\\newcommand{\\resumeProjectHeading}[2]{\\item\\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}\\small\\color{darkblue}#1 & #2 \\\\ \\end{tabular*}\\vspace{-7pt}}\n"
        "\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}\n"
        "\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}\n"
        "\\newcommand{\\resumeItemListStart}{\\begin{itemize}}\n"
        "\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}\n"
    )


def _render_header_parts(contact: dict) -> list[str]:
    parts = []
    if contact.get("phone"):
        phone = latex_escape(contact["phone"])
        parts.append(f"\\faMobile \\hspace{{.5pt}} \\href{{tel:{phone}}}{{{phone}}}")
    if contact.get("email"):
        email = latex_escape(contact["email"])
        parts.append(f"\\faAt \\hspace{{.5pt}} \\href{{mailto:{email}}}{{{email}}}")
    if contact.get("linkedin"):
        url = latex_escape(contact["linkedin"])
        parts.append(f"\\faLinkedinSquare \\hspace{{.5pt}} \\href{{{url}}}{{LinkedIn}}")
    if contact.get("github"):
        url = latex_escape(contact["github"])
        parts.append(f"\\faGithub \\hspace{{.5pt}} \\href{{{url}}}{{GitHub}}")
    if contact.get("website"):
        url = latex_escape(contact["website"])
        parts.append(f"\\faGlobe \\hspace{{.5pt}} \\href{{{url}}}{{Portfolio}}")
    if contact.get("location"):
        parts.append(f"\\faMapMarker \\hspace{{.5pt}} {{ {latex_escape(contact['location'])} }}")
    return parts


def _render_section(section: str, content: dict) -> str | None:
    if section == "about":
        about = (content.get("about") or "").strip()
        if not about:
            return None
        return f"\\section{{Professional Summary}}\n\\noindent {latex_escape(about)}"

    if section == "skills":
        groups = content.get("skills") or []
        if not groups:
            return None
        items = []
        for g in groups:
            label = g.get("group") or ""
            vals = [latex_escape(x) for x in (g.get("items") or []) if x]
            if not label and not vals:
                continue
            items.append(f"\\textbf{{\\color{{darkblue}}{latex_escape(label)}}}{{: {', '.join(vals)}}} \\\\")
        if not items:
            return None
        return (
            "\\section{Technical Skills}\n"
            "\\begin{itemize}[leftmargin=0.15in, label={}]\n"
            "  \\small{\\item{\n" + "\n".join("      " + i for i in items) + "\n  }}\n"
            "\\end{itemize}"
        )

    if section == "work":
        entries = content.get("work") or []
        if not entries:
            return None
        out = ["\\section{Experience}", "  \\resumeSubHeadingListStart"]
        for e in entries:
            title = latex_escape(e.get("title") or "")
            company = latex_escape(e.get("company") or "")
            location = latex_escape(e.get("location") or "")
            dates = f"{e.get('start') or ''} -- {e.get('end') or ''}".strip(" -")
            out.append("    \\resumeSubheading")
            out.append(f"      {{{title}}}{{{dates}}}")
            out.append(f"      {{{company}}}{{{location}}}")
            bullets = e.get("bullets") or []
            if bullets:
                out.append("      \\resumeItemListStart")
                for b in bullets:
                    if b:
                        out.append(f"        \\resumeItem{{{latex_escape(b)}}}")
                out.append("      \\resumeItemListEnd")
        out.append("  \\resumeSubHeadingListEnd")
        return "\n".join(out)

    if section == "projects":
        entries = content.get("projects") or []
        if not entries:
            return None
        out = ["\\section{Projects}", "  \\resumeSubHeadingListStart"]
        for p in entries:
            name = latex_escape(p.get("name") or "")
            detail = latex_escape(p.get("link") or p.get("date") or "")
            out.append("    \\resumeProjectHeading")
            out.append(f"      {{\\textbf{{\\color{{darkblue}}{name}}}}}{{{detail}}}")
            bullets = p.get("bullets") or []
            if bullets:
                out.append("      \\resumeItemListStart")
                for b in bullets:
                    if b:
                        out.append(f"        \\resumeItem{{{latex_escape(b)}}}")
                out.append("      \\resumeItemListEnd")
        out.append("  \\resumeSubHeadingListEnd")
        return "\n".join(out)

    if section == "education":
        entries = content.get("education") or []
        if not entries:
            return None
        out = ["\\section{Education}", "  \\resumeSubHeadingListStart"]
        for e in entries:
            degree = latex_escape(e.get("degree") or "")
            field = latex_escape(e.get("field") or "")
            school = latex_escape(e.get("school") or "")
            location = latex_escape(e.get("where") or e.get("location") or "")
            left = f"{degree} | {field}".strip(" |")
            dates = f"{e.get('start') or ''} -- {e.get('end') or ''}".strip(" -")
            out.append("    \\resumeSubheading")
            out.append(f"      {{{left}}}{{{dates}}}")
            out.append(f"      {{{school}}}{{{location}}}")
            details = e.get("details") or []
            if details:
                out.append("      \\resumeItemListStart")
                for d in details:
                    out.append(f"        \\resumeItem{{{latex_escape(d)}}}")
                out.append("      \\resumeItemListEnd")
        out.append("  \\resumeSubHeadingListEnd")
        return "\n".join(out)

    if section == "certifications":
        entries = content.get("certifications") or []
        if not entries:
            return None
        out = ["\\section{Certifications}", "  \\resumeSubHeadingListStart"]
        for c in entries:
            issuer = latex_escape(c.get("issuer") or "")
            name = latex_escape(c.get("name") or "")
            out.append(f"      \\resumeItem{{\\textbf{{\\color{{darkblue}}{issuer}}} $|$ {name}}}")
        out.append("  \\resumeSubHeadingListEnd")
        return "\n".join(out)

    if section == "links":
        entries = content.get("links") or []
        if not entries:
            return None
        out = ["\\section{Links}", "  \\resumeSubHeadingListStart"]
        for l in entries:
            label = latex_escape(l.get("label") or "")
            url = latex_escape(l.get("url") or "")
            out.append(f"      \\resumeItem{{\\textbf{{\\color{{darkblue}}{label}}} $|$ {url}}}")
        out.append("  \\resumeSubHeadingListEnd")
        return "\n".join(out)

    if section == "volunteer":
        entries = content.get("volunteer") or []
        if not entries:
            return None
        out = ["\\section{Volunteer}", "  \\resumeSubHeadingListStart"]
        for v in entries:
            role = latex_escape(v.get("role") or "")
            org = latex_escape(v.get("org") or "")
            location = latex_escape(v.get("location") or "")
            dates = f"{v.get('start') or ''} -- {v.get('end') or ''}".strip(" -")
            out.append("    \\resumeSubheading")
            out.append(f"      {{{role}}}{{{dates}}}")
            out.append(f"      {{{org}}}{{{location}}}")
            bullets = v.get("bullets") or []
            if bullets:
                out.append("      \\resumeItemListStart")
                for b in bullets:
                    if b:
                        out.append(f"        \\resumeItem{{{latex_escape(b)}}}")
                out.append("      \\resumeItemListEnd")
        out.append("  \\resumeSubHeadingListEnd")
        return "\n".join(out)

    return None


def latex_to_content(latex: str) -> tuple[dict, bool]:
    """Best-effort deterministic parse of the standard JobForge skeleton into BuilderContent."""
    content: dict[str, Any] = {}
    ok = False

    if not latex:
        return content, ok

    # Header name
    m = re.search(r"\\textbf\{\\Huge \s*\\scshape \s*\\color\{darkturquoise\}\s*([^}]+)\}", latex)
    contact: dict[str, Any] = {}
    if m:
        contact["name"] = _strip_inline(m.group(1))
        ok = True
    contact.update(_parse_header_contacts(latex))
    if contact:
        content["contact"] = contact

    section_titles = {
        "Professional Summary": "about",
        "Experience": "work",
        "Projects": "projects",
        "Education": "education",
        "Technical Skills": "skills",
        "Certifications": "certifications",
        "Links": "links",
        "Volunteer": "volunteer",
    }

    # Find section blocks (allow \section* too).
    hits = list(re.finditer(r"\\section\*?\s*\{([^}]+)\}", latex))
    for i, hit in enumerate(hits):
        title = _strip_inline(hit.group(1))
        key = section_titles.get(title)
        if not key:
            continue
        start = hit.end()
        end = hits[i + 1].start() if i + 1 < len(hits) else latex.find("\\end{document}")
        if end == -1:
            end = len(latex)
        block = latex[start:end]

        if key == "about":
            content["about"] = _strip_inline(block.replace("\\noindent", ""))
        elif key == "skills":
            content["skills"] = _parse_skills(block)
        elif key in ("work", "education", "projects", "volunteer"):
            content[key] = _parse_entries(block, kind=key)
        elif key in ("certifications", "links"):
            content[key] = _parse_cert_links(block)

    if "work" in content or "education" in content:
        ok = True

    order = []
    for key in DEFAULT_SECTION_ORDER:
        if content.get(key):
            order.append(key)
    if order:
        content["section_order"] = order

    if not content:
        # Nothing parsed at all — not the standard skeleton.
        return content, False
    return content, ok


def _parse_header_contacts(latex: str) -> dict:
    contact: dict[str, Any] = {}
    patterns = {
        "phone": r"\\faMobile\s+.*?\\href\{tel:([^}]+)\}\{([^}]+)\}",
        "email": r"\\faAt\s+.*?\\href\{mailto:([^}]+)\}\{([^}]+)\}",
        "linkedin": r"\\faLinkedinSquare\s+.*?\\href\{(https?://[^}]+)\}\{LinkedIn\}",
        "github": r"\\faGithub\s+.*?\\href\{(https?://[^}]+)\}\{GitHub\}",
        "website": r"\\faGlobe\s+.*?\\href\{(https?://[^}]+)\}\{Portfolio\}",
        "location": r"\\faMapMarker\s+.*?\{\s*([^}]+)\}",
    }
    for field, pat in patterns.items():
        m = re.search(pat, latex)
        if m:
            contact[field] = _strip_inline(m.group(1))
    return contact


def _parse_skills(block: str) -> list[dict]:
    groups = []
    for m in re.finditer(r"\\textbf\{\\color\{darkblue\}([^}]+)\}\{:\s*([^}]*)\}", block):
        items = [x.strip() for x in _strip_inline(m.group(2)).split(",") if x.strip()]
        groups.append({"group": _strip_inline(m.group(1)), "items": items})
    return groups


def _parse_entries(block: str, *, kind: str) -> list[dict]:
    """Parse a subheading section (work/education/projects/volunteer) into list entries."""
    entries = []
    # Split on each \resumeSubheading or \resumeProjectHeading.
    tokens = re.split(r"(\\resumeSubheading|\\resumeProjectHeading)", block)
    i = 1
    while i < len(tokens):
        marker = tokens[i]
        body = tokens[i + 1] if i + 1 < len(tokens) else ""
        # Extract the four braced groups after the marker, possibly across newlines.
        arg_groups = re.search(r"^\s*\{(.*?)\}\s*\{(.*?)\}\s*\{(.*?)\}\s*\{(.*?)\}", body, re.S)
        if marker == "\\resumeSubheading" and arg_groups:
            entries.append(_build_entry(kind, arg_groups.groups(), body))
        elif marker == "\\resumeProjectHeading":
            pname = re.search(r"\\textbf\{\\color\{darkblue\}([^}]+)\}\s*\$[|]\$\s*\\emph\{([^}]*)\}", body, re.S) or re.search(r"\\textbf\{\\color\{darkblue\}([^}]+)\}(\s*\$[|]\$\s*\S*)?", body, re.S)
            if pname:
                entries.append({
                    "name": _strip_inline(pname.group(1)),
                    "date": _strip_inline(pname.group(2) if pname.lastindex and pname.lastindex >= 2 else ""),
                    "bullets": _extract_bullets(body),
                })
        else:
            # A stray marker; consume nothing more.
            pass
        # Advance past markers AND the matched arg groups' shared body is re-scanned by bullet extraction
        i += 2
    return entries


def _build_entry(kind: str, groups: tuple, body: str) -> dict:
    g = [(_strip_inline(x) if x else "") for x in groups]
    if kind == "work":
        return {
            "title": g[0], "start": g[1].split("--")[0].strip() if "--" in g[1] else "",
            "end": g[1].split("--")[1].strip() if "--" in g[1] else "",
            "company": g[2], "location": _strip_inline(g[3]),
            "bullets": _extract_bullets(body),
        }
    if kind == "education":
        left = g[0]
        degree, _, field = left.partition("|")
        return {
            "school": g[2], "degree": degree.strip(), "field": field.strip(),
            "start": g[1].split("--")[0].strip() if "--" in g[1] else "",
            "end": g[1].split("--")[1].strip() if "--" in g[1] else "",
            "where": _strip_inline(g[3]), "details": _extract_bullets(body),
        }
    if kind == "volunteer":
        return {
            "org": g[2], "role": g[0], "location": _strip_inline(g[3]),
            "start": g[1].split("--")[0].strip() if "--" in g[1] else "",
            "end": g[1].split("--")[1].strip() if "--" in g[1] else "",
            "bullets": _extract_bullets(body),
        }
    return {"title": g[0], "company": g[2], "bullets": _extract_bullets(body)}


def _parse_cert_links(block: str) -> list[dict]:
    out = []
    for m in re.finditer(r"\\resumeItem\{\\textbf\{\\color\{darkblue\}([^}]+)\}\s*\$[|]\$\s*([^}]+)\}", block):
        out.append({"issuer": _strip_inline(m.group(1)), "name": _strip_inline(m.group(2))})
    return out


def _extract_bullets(block: str) -> list[str]:
    bullets = []
    for m in re.finditer(r"\\resumeItem\{(.*?)\}", block, re.S):
        bullets.append(_strip_inline(m.group(1)))
    return bullets


async def _get_seed_template(db: AsyncSession, workspace_id: uuid.UUID) -> str:
    base = await resumes_service.get_base_resume(db, workspace_id)
    if base and base.latex_source:
        return base.latex_source
    return _read_config_template()


async def get_or_create_builder(
    db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID
) -> BuilderResume:
    result = await db.execute(
        select(BuilderResume).where(
            BuilderResume.workspace_id == workspace_id,
            BuilderResume.job_id == job_id,
        ).limit(1)
    )
    builder = result.scalar_one_or_none()
    if builder:
        return builder

    src = await _get_seed_template(db, workspace_id)
    content, ok = latex_to_content(src)
    if not ok:
        logger.warning("builder.seed_fallback", job_id=str(job_id))
        content = _default_content(src)

    base = await resumes_service.get_base_resume(db, workspace_id)
    primary = _hex_to_rgb_tuple(base.primary_color if base else None)
    secondary = _hex_to_rgb_tuple(base.secondary_color if base else None)
    latex = render_latex_from_content(content, primary, secondary)

    builder = BuilderResume(
        workspace_id=workspace_id,
        job_id=job_id,
        content=content,
        latex_source=latex,
        primary_color=primary,
        secondary_color=secondary,
    )
    db.add(builder)
    await db.flush()
    return builder


def _default_content(src: str) -> dict:
    name = ""
    m = re.search(r"\\textbf\{\\Huge \s*\\scshape \s*\\color\{darkturquoise\}\s*([^}]+)\}", src)
    if m:
        name = _strip_inline(m.group(1))
    return {"contact": {"name": name}}


async def seed_builder(db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID) -> BuilderResume:
    return await get_or_create_builder(db, workspace_id, job_id)


async def save_builder(
    db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID, content: dict
) -> BuilderResume:
    builder = await get_or_create_builder(db, workspace_id, job_id)
    # Snapshot the pre-edit content so single-level undo can restore it.
    db.add(BuilderResumeVersion(
        builder_resume_id=builder.id,
        workspace_id=workspace_id,
        content=builder.content,
        note="Pre-edit snapshot",
    ))
    builder.content = content
    builder.latex_source = render_latex_from_content(content, builder.primary_color, builder.secondary_color)
    await db.flush()
    return builder


async def undo_builder(
    db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID
) -> tuple[dict, str | None]:
    builder = await get_or_create_builder(db, workspace_id, job_id)
    result = await db.execute(
        select(BuilderResumeVersion)
        .where(BuilderResumeVersion.builder_resume_id == builder.id)
        .order_by(BuilderResumeVersion.created_at.desc())
        .limit(1)
    )
    version = result.scalar_one_or_none()
    if version:
        builder.content = version.content
        builder.latex_source = render_latex_from_content(
            version.content, builder.primary_color, builder.secondary_color
        )
        await db.delete(version)
        await db.flush()
    return builder.content, builder.latex_source


def _apply_patch(content: dict, patch: dict) -> dict:
    path = patch.get("path", "")
    op = patch.get("op", "set")
    value = patch.get("value")
    parts = [p for p in path.split(".") if p != ""]
    if not parts:
        return content
    obj: Any = content
    for p in parts[:-1]:
        key = int(p) if p.isdigit() else p
        if isinstance(obj, dict):
            obj = obj.setdefault(key, {})
        else:
            obj = obj[key]
    last = parts[-1]
    last_key = int(last) if last.isdigit() else last
    if op == "append":
        if isinstance(obj, dict):
            obj.setdefault(last_key, []).append(value)
        elif isinstance(obj, list):
            obj.append(value)
        elif last_key not in obj:
            obj[last_key] = [value]
    else:
        if isinstance(obj, dict):
            obj[last_key] = value
        elif isinstance(obj, list) and last_key < len(obj):
            obj[last_key] = value
    return content


async def apply_suggestion(
    db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID, suggestion_id: str
) -> BuilderResume:
    builder = await get_or_create_builder(db, workspace_id, job_id)
    suggestions = builder.suggestions or {}
    items = suggestions.get("suggestions") or []
    target = next((s for s in items if s.get("id") == suggestion_id), None)
    if not target:
        raise ValueError("Suggestion not found")
    _apply_patch(builder.content, target.get("patch") or {})
    db.add(BuilderResumeVersion(
        builder_resume_id=builder.id,
        workspace_id=workspace_id,
        content=builder.content,
        note="Suggestion applied",
    ))
    builder.latex_source = render_latex_from_content(
        builder.content, builder.primary_color, builder.secondary_color
    )
    suggestions["suggestions"] = [s for s in items if s.get("id") != suggestion_id]
    builder.suggestions = suggestions
    await db.flush()
    return builder


async def ignore_suggestion(
    db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID, suggestion_id: str
) -> None:
    builder = await get_or_create_builder(db, workspace_id, job_id)
    suggestions = builder.suggestions or {}
    items = suggestions.get("suggestions") or []
    suggestions["suggestions"] = [s for s in items if s.get("id") != suggestion_id]
    builder.suggestions = suggestions
    await db.flush()


async def save_as_base(
    db: AsyncSession, workspace_id: uuid.UUID, job_id: uuid.UUID
) -> None:
    builder = await get_or_create_builder(db, workspace_id, job_id)
    await resumes_service.create_or_update_base_resume(
        db, workspace_id, latex_source=builder.latex_source
    )
