import uuid
import json
import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update as sa_update

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.ai import (
    DeepSeekRequest,
    DeepSeekResult,
    ResumeEditRequest,
    ResumeEditResult,
    AtsScoreRequest,
    AtsScoreResult,
)
from app.schemas.usage import PlanLimitErrorOut
from app.services import ai as ai_service
from app.services import workspace as workspace_service
from app.services import usage as usage_service
from app.services import user as user_service
from app.services import builder as builder_service
from app.models.job import Job

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


def _format_salary(amount, currency, frequency) -> str:
    parts = []
    if amount is not None:
        amt = amount
        if amt == amt.to_integral_value():
            parts.append(str(int(amt)))
        else:
            parts.append(format(amt, "f").rstrip("0").rstrip("."))
    if currency:
        parts.append(currency)
    if frequency:
        parts.append(frequency)
    return " ".join(parts)


def _build_profile_block(profile) -> str | None:
    """Stable, cacheable user-profile prefix injected into the system prompt on every AI call."""
    if not profile:
        return None
    return (
        "\n\n=== USER PROFILE (candidate memory — always apply) ===\n"
        f"Name: {profile.full_name or ''}\n"
        f"Current location: {profile.location or ''}\n"
        f"Current salary: {_format_salary(profile.current_salary, profile.salary_currency, profile.salary_frequency)}\n"
    )


def _parse_resume_chat(content: str) -> tuple[str, str | None]:
    """Parse a resume_chat response into (answer, updated_latex)."""
    answer = content
    updated = None
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            if parsed.get("answer"):
                answer = parsed["answer"]
            if isinstance(parsed.get("updated"), str) and len(parsed["updated"]) > 100:
                updated = parsed["updated"]
    except (json.JSONDecodeError, ValueError):
        pass
    return answer, updated


def _compute_section_completion(content: dict) -> dict:
    """Deterministic Section Completion fallback when the model omits it from builder_score."""
    contact = content.get("contact") or {}
    checks = [
        ("Contact", bool(contact.get("name") or contact.get("email"))),
        ("Summary", bool(content.get("about"))),
        ("Skills", bool(content.get("skills"))),
        ("Experience", bool(content.get("work"))),
        ("Education", bool(content.get("education"))),
        ("Projects", bool(content.get("projects"))),
        ("Certifications", bool(content.get("certifications"))),
    ]
    ok_count = sum(1 for _, ok in checks if ok)
    return {
        "score": round(100 * ok_count / len(checks)) if checks else 0,
        "checks": [{"label": label, "ok": ok_flag} for label, ok_flag in checks],
    }


async def _log_ai_call(db, workspace_id, user_id, job_id, res, purpose):
    await ai_service.log_ai_cost(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        job_id=job_id,
        model_name=res["model_name"],
        input_tokens=res["input_tokens"],
        output_tokens=res["output_tokens"],
        total_tokens=res["total_tokens"],
        input_cost=res["input_cost"],
        output_cost=res["output_cost"],
        total_cost=res["total_cost"],
        purpose=purpose,
    )


async def get_workspace_info(user: dict, db: AsyncSession):
    ws = await workspace_service.get_workspace_for_user(db, uuid.UUID(user["user_id"]))
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return ws


@router.post("/generate", response_model=DeepSeekResult)
async def ai_generate(
    data: DeepSeekRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await get_workspace_info(user, db)
    user_id = uuid.UUID(user["user_id"])

    is_cover_letter = data.prompt_name == "generate_cover_letter"
    if is_cover_letter:
        check = await usage_service.can_generate_cover_letter(db, user_id)
        if not check.allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=PlanLimitErrorOut(
                    message=f"You've reached your {check.plan_name} plan's cover letter limit. Upgrade to generate more.",
                    currentPlan=check.plan_name,
                    limit=check.limit,
                    used=check.used,
                ).model_dump(),
            )

    render_vars = dict(data.vars)

    # Builder prompts expect {{title}} / {{jd}} / {{resume_json}}, but the frontend only sends
    # vars:{job_id}. Resolve them server-side from the Job and seeded BuilderResume.
    BUILDER_PROMPTS = {"builder_job_match", "builder_score", "builder_suggestions"}
    if data.prompt_name in BUILDER_PROMPTS and data.job_id:
        job = (
            await db.execute(select(Job).where(Job.id == uuid.UUID(data.job_id)))
        ).scalar_one_or_none()
        builder = await builder_service.get_or_create_builder(db, ws.id, uuid.UUID(data.job_id))
        render_vars.setdefault("title", job.title if job else "")
        render_vars.setdefault("jd", (job.description or "") if job else "")
        render_vars.setdefault("resume_json", json.dumps(builder.content, default=str))

    profile = await user_service.get_profile(db, uuid.UUID(user["user_id"]))
    profile_block = _build_profile_block(profile)

    try:
        result = await ai_service.call_deepseek(
            prompt_name=data.prompt_name,
            vars=render_vars,
            purpose=data.purpose,
            override_temperature=data.override_temperature,
            profile_block=profile_block,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    await ai_service.log_ai_cost(
        db,
        workspace_id=str(ws.id),
        user_id=user["user_id"],
        job_id=data.job_id,
        model_name=result["model_name"],
        input_tokens=result["input_tokens"],
        output_tokens=result["output_tokens"],
        total_tokens=result["total_tokens"],
        input_cost=result["input_cost"],
        output_cost=result["output_cost"],
        total_cost=result["total_cost"],
        purpose=data.purpose,
    )

    if data.job_id and data.prompt_name == "extract_insights":
        try:
            parsed = json.loads(result["content"])
            if isinstance(parsed, dict):
                await db.execute(
                    sa_update(Job)
                    .where(Job.id == uuid.UUID(data.job_id))
                    .values(insights=parsed)
                )
                await db.flush()
        except (json.JSONDecodeError, ValueError):
            pass

    if data.job_id and data.prompt_name == "resume_scorer":
        try:
            parsed = json.loads(result["content"])
            if isinstance(parsed, dict):
                await db.execute(
                    sa_update(Job)
                    .where(Job.id == uuid.UUID(data.job_id))
                    .values(base_fit_score=parsed)
                )
                await db.flush()
        except (json.JSONDecodeError, ValueError):
            pass

    if is_cover_letter:
        await usage_service.increment_cover_letter_usage(db, user_id)

    # Persist builder analysis back onto the BuilderResume so /seed refetch (triggered by the
    # frontend's query invalidate) returns the latest Job Match / Score / Suggestions.
    if data.job_id and data.prompt_name in BUILDER_PROMPTS:
        builder = await builder_service.get_or_create_builder(db, ws.id, uuid.UUID(data.job_id))
        try:
            parsed = json.loads(result["content"])
            if isinstance(parsed, dict):
                if data.prompt_name == "builder_score" and not parsed.get("section"):
                    parsed["section"] = _compute_section_completion(builder.content)
                if data.prompt_name == "builder_job_match":
                    builder.job_match = parsed
                elif data.prompt_name == "builder_score":
                    builder.score = parsed
                elif data.prompt_name == "builder_suggestions":
                    builder.suggestions = parsed
                await db.flush()
        except (json.JSONDecodeError, ValueError):
            pass

    # Tailored resumes: the whole-document call tends to update Skills but leave Experience
    # bullets untouched. Run a focused, best-effort rewrite of the Experience section and splice it in.
    if data.prompt_name == "tailor_resume":
        base_latex = str(render_vars.get("resume_latex", "") or "")
        experience = ai_service._extract_section(base_latex, "Experience") if base_latex else None
        if experience and "\\resumeItem" in experience:
            try:
                rewritten = await ai_service.call_deepseek(
                    prompt_name="rewrite_experience",
                    vars={
                        "jd": str(render_vars.get("jd", "") or ""),
                        "experience": experience,
                        "resume_latex": base_latex,
                    },
                    purpose=data.purpose,
                    profile_block=profile_block,
                )
                await _log_ai_call(db, str(ws.id), user["user_id"], data.job_id, rewritten, data.purpose)
                # Only splice a well-formed Experience list body. Guard against a stray
                # \section{...} header or a malformed/empty response so we never corrupt
                # the tailored document or silently drop the rewrite.
                rewritten_body = rewritten["content"].strip()
                rewritten_body = re.sub(r"^\s*\\section\{[^}]*\}\s*", "", rewritten_body)
                if (
                    "\\resumeSubHeadingListStart" in rewritten_body
                    and "\\resumeSubHeadingListEnd" in rewritten_body
                    and "\\resumeItem" in rewritten_body
                    and "\\end{document}" not in rewritten_body
                ):
                    new_content = ai_service._replace_section(
                        result["content"], "Experience", rewritten_body
                    )
                    if "\\end{document}" in new_content and "\\resumeItem" in new_content:
                        result["content"] = new_content
                        result["total_cost"] = result["total_cost"] + rewritten["total_cost"]
                        result["input_tokens"] = result["input_tokens"] + rewritten["input_tokens"]
                        result["output_tokens"] = result["output_tokens"] + rewritten["output_tokens"]
                        result["total_tokens"] = result["total_tokens"] + rewritten["total_tokens"]
            except Exception:
                # Best-effort: keep the whole-document output on any error.
                pass

    return result


@router.post("/edit-resume", response_model=ResumeEditResult)
async def edit_resume(
    data: ResumeEditRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await get_workspace_info(user, db)

    profile = await user_service.get_profile(db, uuid.UUID(user["user_id"]))
    profile_block = _build_profile_block(profile)

    res = await ai_service.call_deepseek(
        prompt_name="resume_chat",
        vars={"jd": data.latex_source, "question": data.question},
        purpose="custom",
        profile_block=profile_block,
    )
    await _log_ai_call(db, str(ws.id), user["user_id"], data.job_id, res, "custom")

    answer, updated = _parse_resume_chat(res["content"])

    return ResumeEditResult(answer=answer, updated_latex=updated)


@router.post("/ats-score", response_model=AtsScoreResult)
async def ats_score(
    data: AtsScoreRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await get_workspace_info(user, db)

    job = (await db.execute(select(Job).where(Job.id == uuid.UUID(data.job_id)))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    profile = await user_service.get_profile(db, uuid.UUID(user["user_id"]))
    profile_block = _build_profile_block(profile)

    result = await ai_service.call_deepseek(
        prompt_name="ats_score",
        vars={"jd": job.description or "", "resume_latex": data.latex_source},
        purpose="resume_scoring",
        profile_block=profile_block,
    )
    await ai_service.log_ai_cost(
        db,
        workspace_id=str(ws.id),
        user_id=user["user_id"],
        job_id=data.job_id,
        model_name=result["model_name"],
        input_tokens=result["input_tokens"],
        output_tokens=result["output_tokens"],
        total_tokens=result["total_tokens"],
        input_cost=result["input_cost"],
        output_cost=result["output_cost"],
        total_cost=result["total_cost"],
        purpose="resume_scoring",
    )

    parsed: dict = {}
    try:
        parsed = json.loads(result["content"])
        if not isinstance(parsed, dict):
            parsed = {}
    except (json.JSONDecodeError, ValueError):
        parsed = {}

    base_score = max(0, min(100, int(parsed.get("base_score", 0) or 0)))
    jd_keywords = [str(k).strip() for k in (parsed.get("jd_keywords", []) or []) if str(k).strip()]

    plain = ai_service._latex_to_plain_text(data.latex_source)
    matched_keywords = [k for k in jd_keywords if ai_service._keyword_present(k, plain)]
    missing_keywords = [k for k in jd_keywords if not ai_service._keyword_present(k, plain)]
    job_match_score = round(100 * len(matched_keywords) / len(jd_keywords)) if jd_keywords else 100
    job_match_score = max(0, min(100, job_match_score))

    await db.execute(
        sa_update(Job).where(Job.id == uuid.UUID(data.job_id)).values(resume_score=job_match_score)
    )
    await db.flush()

    return AtsScoreResult(
        base_score=base_score,
        job_match_score=job_match_score,
        matched_keywords=matched_keywords,
        missing_keywords=missing_keywords,
        format_checks=parsed.get("format_checks", {}) or {},
        summary=parsed.get("summary", "") or "",
        suggestions=parsed.get("suggestions", []) or [],
    )


@router.get("/entitlement")
async def check_entitlement(
    job_id: str | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(user["user_id"])
    job_tracks = await usage_service.can_create_job_track(db, user_id)
    cover_letters = await usage_service.can_generate_cover_letter(db, user_id)
    return {
        "allowed": job_tracks.allowed and cover_letters.allowed,
        "job_track": {"allowed": job_tracks.allowed, "used": job_tracks.used, "limit": job_tracks.limit},
        "cover_letter": {"allowed": cover_letters.allowed, "used": cover_letters.used, "limit": cover_letters.limit},
    }
