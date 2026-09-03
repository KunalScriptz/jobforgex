import json
import os
import re
import yaml
import httpx
import hashlib
import hmac
import asyncio
from datetime import datetime
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.storage import upload_pdf


FORMATTING_RULES = (
    "\n\nFORMATTING RULES:\n"
    "- Never use em dashes (—), en dashes (–), or double/triple hyphens (--, ---) in any output text.\n"
    "- Never use hyphens as list bullets or separators — use numbering, asterisks, or punctuation instead.\n"
    "- Hyphens are allowed ONLY inside compound words or hyphenated terms "
    '(e.g. "state-of-the-art", "co-founder", "e-commerce").'
)

LATEX_OUTPUT_PROMPTS = {"tailor_resume", "generate_cover_letter", "pdf_to_latex", "rewrite_experience"}


PROMPTS_PATHS = [
    Path(__file__).parent.parent / "config" / "prompts",          # backend/config/prompts/
    Path(os.getcwd()) / "config" / "prompts",                     # ./config/prompts/ (Docker mount)
    Path(__file__).parent.parent.parent / "config" / "prompts",   # ../config/prompts/
]


def load_prompt(prompt_name: str) -> dict:
    for base in PROMPTS_PATHS:
        prompt_path = base / f"{prompt_name}.yaml"
        if prompt_path.exists():
            break
    else:
        raise ValueError(f"Prompt not found: {prompt_name}")
    with open(prompt_path) as f:
        return yaml.safe_load(f)


def render_prompt(template: str, vars: dict) -> str:
    result = template
    for key, value in vars.items():
        result = result.replace(f"{{{{{key}}}}}", str(value))
    return result


def _latex_to_plain_text(source: str) -> str:
    """Strip LaTeX commands/comments down to a plain, lowercase text corpus for keyword matching."""
    text = re.sub(r"(?<!\\)%.*", " ", source)  # comments (unescaped % to end of line)
    text = re.sub(r"\\begin\{[^}]*\}|\\end\{[^}]*\}", " ", text)  # environments
    text = re.sub(r"\\[a-zA-Z@]+\*?", " ", text)  # command names (e.g. \section, \textbf, \item)
    text = text.replace("{", " ").replace("}", " ").replace("\\", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip().lower()


def _keyword_present(keyword: str, plain_text: str) -> bool:
    """Case-insensitive keyword match with alphanumeric boundaries so 'Go' does not match 'Google'.

    Tries several normalized forms of the keyword (raw, lowercased, suffix/version-stripped) so that
    "React.js" also matches text containing "React" or "React 18".
    """
    if not keyword or not keyword.strip():
        return False

    variants: set[str] = set()
    for raw in (keyword, keyword.lower()):
        raw = raw.strip()
        variants.add(raw)
        no_suffix = re.sub(r"\.(js|ts|jsx|tsx)$", "", raw)            # react.js -> react
        variants.add(no_suffix)
        no_version = re.sub(r"\s*\d+(?:\.\d+)?[a-z]*$", "", no_suffix)  # react 18 -> react
        variants.add(no_version)

    for v in variants:
        v = v.strip()
        if not v:
            continue
        if re.search(rf"(?<![A-Za-z0-9]){re.escape(v)}(?![A-Za-z0-9])", plain_text, re.IGNORECASE):
            return True
    return False


def _extract_section(latex: str, name: str) -> str | None:
    """Return the body of the first \\section{...<name>...} block, up to the next section or \\end{document}."""
    m = re.search(
        r"\\section\*?\{[^}]*" + re.escape(name) + r"[^}]*\}(.*?)(?=\\section\*?\{|\\end\{document\}|\Z)",
        latex,
        re.DOTALL,
    )
    return m.group(1) if m else None


def _replace_section(latex: str, name: str, new_body: str) -> str:
    """Replace the body of the first \\section{...<name>...} block with new_body."""
    pattern = (
        r"(\\section\*?\{[^}]*" + re.escape(name) + r"[^}]*\})"
        r"(.*?)(?=\\section\*?\{|\\end\{document\}|\Z)"
    )
    return re.sub(pattern, lambda m: m.group(1) + new_body, latex, count=1, flags=re.DOTALL)


async def call_deepseek(
    prompt_name: str,
    vars: dict[str, str | float | int],
    purpose: str = "custom",
    override_temperature: float | None = None,
    profile_block: str | None = None,
) -> dict:
    api_key = settings.DEEPSEEK_API_KEY.strip()
    if not api_key:
        raise RuntimeError("DeepSeek API key not configured")

    prompt = load_prompt(prompt_name)
    base_url = settings.DEEPSEEK_BASE_URL.rstrip("/")
    model = settings.DEEPSEEK_MODEL

    system = prompt["system"]
    # Append the (per-user stable) profile block to the system prompt so DeepSeek's
    # automatic context caching reuses this prefix across requests. Keep it out of the
    # variable user_template — anything variable before the profile would break the cache.
    if profile_block:
        system += profile_block
    if prompt_name not in LATEX_OUTPUT_PROMPTS:
        system += FORMATTING_RULES

    render_vars = dict(vars)
    render_vars.setdefault("today_date", f"{datetime.now():%B %-d, %Y}")

    body = {
        "model": model,
        "temperature": override_temperature if override_temperature is not None else prompt.get("temperature", 0.3),
        "max_tokens": 8192,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": render_prompt(prompt["user_template"], render_vars)},
        ],
    }

    if prompt.get("response_format") == "json_object":
        body["response_format"] = {"type": "json_object"}

    max_retries = 3
    last_error = None
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                res = await client.post(
                    f"{base_url}/chat/completions",
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                    json=body,
                )
                if res.status_code == 200:
                    data = res.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    usage = data.get("usage", {})
                    in_tok = usage.get("prompt_tokens", 0)
                    cache_hit = usage.get("prompt_cache_hit_tokens", 0)
                    cache_miss = usage.get("prompt_cache_miss_tokens", max(in_tok - cache_hit, 0))
                    out_tok = usage.get("completion_tokens", 0)
                    break

                text = res.text[:500]
                if res.status_code in (429, 503) and attempt < max_retries - 1:
                    wait = (2 ** attempt) * 1.5
                    await asyncio.sleep(wait)
                    last_error = RuntimeError(f"AI provider busy (attempt {attempt + 1}/{max_retries}), retrying in {wait}s...")
                    continue
                raise RuntimeError(f"AI provider error {res.status_code}: {text}")
        except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as e:
            if attempt < max_retries - 1:
                wait = (2 ** attempt) * 1.5
                await asyncio.sleep(wait)
                last_error = RuntimeError(f"AI provider connection error (attempt {attempt + 1}/{max_retries}): {e}")
                continue
            raise

    if last_error and not 'data' in locals():
        raise last_error

    in_cost = (cache_miss / 1_000_000) * settings.DEEPSEEK_INPUT_PRICE_PER_1M
    in_cost += (cache_hit / 1_000_000) * settings.DEEPSEEK_CACHE_HIT_PRICE_PER_1M
    out_cost = (out_tok / 1_000_000) * settings.DEEPSEEK_OUTPUT_PRICE_PER_1M
    total_cost = in_cost + out_cost

    return {
        "content": content,
        "input_tokens": in_tok,
        "cache_hit_tokens": cache_hit,
        "output_tokens": out_tok,
        "total_cost": total_cost,
        "model_name": settings.DEEPSEEK_MODEL,
        "total_tokens": in_tok + out_tok,
        "input_cost": in_cost,
        "output_cost": out_cost,
    }


async def compile_latex(source: str) -> tuple[bool, bytes | str]:
    url = settings.LATEX_COMPILE_URL.rstrip("/")
    if not url:
        return False, "No LaTeX compiler configured"

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            headers = {"Content-Type": "application/json"}
            if settings.LATEX_SHARED_SECRET:
                headers["x-shared-secret"] = settings.LATEX_SHARED_SECRET
            res = await client.post(
                f"{url}/compile",
                headers=headers,
                json={"source": source},
            )
            if res.status_code == 200:
                return True, res.content
            else:
                text = res.text[:1500]
                return False, f"Compile failed ({res.status_code}): {text}"
    except Exception as e:
        return False, f"Compile request failed: {str(e)}"


def count_pdf_pages(pdf_bytes: bytes) -> int:
    """Count pages in a pdflatex-generated PDF with no extra dependency.

    Counts the `/Type /Page` page objects while excluding the `/Type /Pages` page-tree
    node (the `\\b` boundary after "Page" does not match "Pages").
    """
    import re

    pages = re.findall(rb"/Type\s*/Page\b", pdf_bytes)
    if pages:
        return len(pages)
    # Fallback for producers that flatten the object dict: read /Count from the catalog.
    m = re.search(rb"/Count\s+(\d+)", pdf_bytes)
    return int(m.group(1)) if m else 1


async def log_ai_cost(
    db: AsyncSession,
    workspace_id: str,
    user_id: str,
    job_id: str | None,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    total_tokens: int,
    input_cost: float,
    output_cost: float,
    total_cost: float,
    purpose: str,
) -> None:
    from app.models.ai_cost_log import AICostLog, AIPurpose
    import uuid as _uuid

    purpose_map = {
        "resume_tailoring": AIPurpose.RESUME_TAILORING,
        "cover_letter": AIPurpose.COVER_LETTER,
        "resume_scoring": AIPurpose.RESUME_SCORING,
        "jd_parsing": AIPurpose.JD_PARSING,
        "ats_check": AIPurpose.ATS_CHECK,
        "custom": AIPurpose.CUSTOM,
        "builder_job_match": AIPurpose.CUSTOM,
        "builder_score": AIPurpose.CUSTOM,
        "builder_suggestions": AIPurpose.CUSTOM,
    }

    log = AICostLog(
        workspace_id=_uuid.UUID(workspace_id) if isinstance(workspace_id, str) else workspace_id,
        user_id=_uuid.UUID(user_id) if isinstance(user_id, str) else user_id,
        job_id=_uuid.UUID(job_id) if job_id else None,
        model_name=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        input_cost=input_cost,
        output_cost=output_cost,
        total_cost=total_cost,
        purpose=purpose_map.get(purpose, AIPurpose.CUSTOM),
    )
    db.add(log)
    await db.flush()


async def check_entitlement(db: AsyncSession, workspace_id: str, job_id: str | None = None) -> bool:
    from app.models.workspace import Workspace
    from app.models.job import JobArtifact, ArtifactKind
    from sqlalchemy import select
    import uuid as _uuid

    ws_result = await db.execute(
        select(Workspace).where(Workspace.id == _uuid.UUID(workspace_id))
    )
    ws = ws_result.scalar_one_or_none()
    if not ws:
        return False

    if ws.plan == "pro":
        return True

    from app.models.subscription import Subscription

    sub_result = await db.execute(
        select(Subscription).where(Subscription.user_id == ws.owner_user_id)
    )
    sub = sub_result.scalar_one_or_none()
    if sub and sub.subscription_status == "active" and not sub.suspended:
        return True

    art_result = await db.execute(
        select(JobArtifact)
        .where(JobArtifact.workspace_id == _uuid.UUID(workspace_id))
        .where(JobArtifact.kind.in_([ArtifactKind.TAILORED_RESUME, ArtifactKind.COVER_LETTER]))
    )
    arts = list(art_result.scalars().all())

    distinct_jobs = set(str(a.job_id) for a in arts if a.job_id)
    if job_id and job_id in distinct_jobs:
        return True

    limit = ws.trial_apps_limit
    return len(distinct_jobs) < limit
