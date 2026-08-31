import uuid
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update as sa_update

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.ai import DeepSeekRequest, DeepSeekResult
from app.services import ai as ai_service
from app.services import workspace as workspace_service
from app.services import user as user_service
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

    allowed = await ai_service.check_entitlement(db, str(ws.id), data.job_id)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Free trial limit reached")

    render_vars = dict(data.vars)
    if data.prompt_name == "resume_chat":
        profile = await user_service.get_profile(db, uuid.UUID(user["user_id"]))
        if profile:
            render_vars.setdefault("profile_name", profile.full_name or "")
            render_vars.setdefault("profile_location", profile.location or "")
            render_vars.setdefault("profile_salary", _format_salary(profile.current_salary, profile.salary_currency, profile.salary_frequency))

    try:
        result = await ai_service.call_deepseek(
            prompt_name=data.prompt_name,
            vars=render_vars,
            purpose=data.purpose,
            override_temperature=data.override_temperature,
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

    return result


@router.get("/entitlement")
async def check_entitlement(
    job_id: str | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await get_workspace_info(user, db)
    allowed = await ai_service.check_entitlement(db, str(ws.id), job_id)
    return {"allowed": allowed}
