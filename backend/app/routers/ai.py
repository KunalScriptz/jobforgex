import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.ai import DeepSeekRequest, DeepSeekResult
from app.services import ai as ai_service
from app.services import workspace as workspace_service

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


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

    try:
        result = await ai_service.call_deepseek(
            prompt_name=data.prompt_name,
            vars=data.vars,
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
