import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel as _PydanticBase


class LatexCompileRequest(_PydanticBase):
    source: str
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.resume import (
    ResumeCreate,
    ResumeUpdate,
    ResumeOut,
    ResumeVersionCreate,
    ResumeVersionOut,
    CompileRequest,
    CompileResult,
    PdfUrlRequest,
    PdfUrlResult,
)
from app.services import resumes as resumes_service
from app.services import workspace as workspace_service
from app.services import ai as ai_service
from app.services import storage as storage_service
from app.services import jobs as jobs_service

router = APIRouter(prefix="/api/v1/resumes", tags=["resumes"])


async def get_workspace_id(user: dict, db: AsyncSession) -> uuid.UUID:
    ws = await workspace_service.get_workspace_for_user(db, uuid.UUID(user["user_id"]))
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return ws.id


@router.get("/", response_model=list[ResumeOut])
async def list_resumes(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    return await resumes_service.list_resumes(db, ws_id)


@router.get("/base", response_model=ResumeOut | None)
async def get_base_resume(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    return await resumes_service.get_base_resume(db, ws_id)


@router.post("/base", response_model=ResumeOut)
async def save_base_resume(
    data: ResumeCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    resume = await resumes_service.create_or_update_base_resume(
        db, ws_id, data.latex_source, data.name
    )
    await db.refresh(resume)
    return resume


@router.post("/", response_model=ResumeOut, status_code=201)
async def create_template(
    data: ResumeCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    resume = await resumes_service.create_template(
        db, ws_id, latex_source=data.latex_source, name=data.name,
        primary_color=data.primary_color, secondary_color=data.secondary_color,
    )
    await db.refresh(resume)
    return resume


@router.get("/{resume_id}", response_model=ResumeOut)
async def get_resume(
    resume_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    resume = await resumes_service.get_resume(db, ws_id, resume_id)
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume template not found")
    return resume


@router.patch("/{resume_id}", response_model=ResumeOut)
async def update_template(
    resume_id: uuid.UUID,
    data: ResumeUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    resume = await resumes_service.update_template(
        db, ws_id, resume_id,
        name=data.name,
        latex_source=data.latex_source,
        page_count=data.page_count,
        primary_color=data.primary_color,
        secondary_color=data.secondary_color,
    )
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume template not found")
    await db.refresh(resume)
    return resume


@router.delete("/{resume_id}")
async def delete_template(
    resume_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    result = await resumes_service.delete_template(db, ws_id, resume_id)
    if result == "not_found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume template not found")
    if result == "last_template":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete the last template")
    return {"ok": True}


@router.put("/{resume_id}/default", response_model=ResumeOut)
async def set_default_template(
    resume_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    resume = await resumes_service.set_default_template(db, ws_id, resume_id)
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume template not found")
    await db.refresh(resume)
    return resume


@router.put("/{resume_id}/colors")
async def update_colors(
    resume_id: uuid.UUID,
    primary_color: str,
    secondary_color: str,
    db: AsyncSession = Depends(get_db),
):
    await resumes_service.update_resume_colors(db, resume_id, primary_color, secondary_color)
    return {"ok": True}


@router.get("/{resume_id}/versions", response_model=list[ResumeVersionOut])
async def list_versions(
    resume_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await resumes_service.list_resume_versions(db, resume_id)


@router.post("/{resume_id}/versions")
async def restore_version(
    resume_id: uuid.UUID,
    data: ResumeVersionCreate,
    db: AsyncSession = Depends(get_db),
):
    version = await resumes_service.restore_resume_version(db, resume_id)
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    return {"ok": True}


@router.post("/compile", response_model=CompileResult)
async def compile_artifact(
    data: CompileRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    artifact = await jobs_service.get_artifact(db, data.artifact_id)
    if not artifact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    if not artifact.latex_source or len(artifact.latex_source) < 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No LaTeX source to compile")

    ok, result = await ai_service.compile_latex(artifact.latex_source)
    if not ok:
        await jobs_service.update_artifact_pdf_path(db, artifact.id, "", str(result))
        return CompileResult(ok=False, error=str(result))

    ws_id = await get_workspace_id(user, db)
    path = await storage_service.upload_pdf(result, str(ws_id), str(artifact.id))
    await jobs_service.update_artifact_pdf_path(db, artifact.id, path)
    return CompileResult(ok=True, storage_path=path)


@router.post("/pdf-url", response_model=PdfUrlResult)
async def get_pdf_url(
    data: PdfUrlRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    artifact = await jobs_service.get_artifact(db, data.artifact_id)
    if not artifact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")

    if not artifact.pdf_storage_path and artifact.latex_source:
        from app.services import ai as ai_service
        ok, result = await ai_service.compile_latex(artifact.latex_source)
        if not ok:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Recompile failed: {str(result)[:500]}")
        ws_id = await get_workspace_id(user, db)
        path = await storage_service.upload_pdf(result, str(ws_id), str(artifact.id))
        await jobs_service.update_artifact_pdf_path(db, artifact.id, path)
        artifact.pdf_storage_path = path

    if not artifact.pdf_storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No PDF stored")

    pdf_name = (artifact.filename or "document").replace(".tex", "") + ".pdf"
    url = f"/api/v1/files/stream/{data.artifact_id}?inline={'true' if data.inline else 'false'}"
    return PdfUrlResult(url=url, filename=pdf_name)


@router.post("/latex-compile")
async def latex_compile(data: LatexCompileRequest):
    source = data.source
    if not source or len(source) < 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Source too short")

    from app.services import ai as ai_service
    import base64
    ok, result = await ai_service.compile_latex(source)
    if ok:
        page_count = ai_service.count_pdf_pages(result)
        return {"ok": True, "pdf_base64": base64.b64encode(result).decode(), "page_count": page_count}
    return {"ok": False, "error": str(result)}
