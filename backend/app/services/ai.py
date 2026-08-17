import json
import os
import yaml
import httpx
import hashlib
import hmac
import asyncio
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.storage import upload_pdf


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


async def call_deepseek(
    prompt_name: str,
    vars: dict[str, str | float | int],
    purpose: str = "custom",
    override_temperature: float | None = None,
) -> dict:
    api_key = settings.DEEPSEEK_API_KEY.strip()
    if not api_key:
        raise RuntimeError("DeepSeek API key not configured")

    prompt = load_prompt(prompt_name)
    base_url = settings.DEEPSEEK_BASE_URL.rstrip("/")
    model = settings.DEEPSEEK_MODEL

    body = {
        "model": model,
        "temperature": override_temperature if override_temperature is not None else prompt.get("temperature", 0.3),
        "max_tokens": 8192,
        "messages": [
            {"role": "system", "content": prompt["system"]},
            {"role": "user", "content": render_prompt(prompt["user_template"], vars)},
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
                    in_tok = data.get("usage", {}).get("prompt_tokens", 0)
                    out_tok = data.get("usage", {}).get("completion_tokens", 0)
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

    in_cost = (in_tok / 1_000_000) * settings.DEEPSEEK_INPUT_PRICE_PER_1M
    out_cost = (out_tok / 1_000_000) * settings.DEEPSEEK_OUTPUT_PRICE_PER_1M
    total_cost = in_cost + out_cost

    return {
        "content": content,
        "input_tokens": in_tok,
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
        "builder_seed": AIPurpose.CUSTOM,
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


