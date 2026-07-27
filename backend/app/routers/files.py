from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.services import storage as storage_service
from app.services import jobs as jobs_service

router = APIRouter(prefix="/api/v1/files", tags=["files"])


@router.get("/download/{artifact_id}")
async def download_pdf(
    artifact_id: str,
    inline: bool = False,
    db: AsyncSession = Depends(get_db),
):
    import uuid
    artifact = await jobs_service.get_artifact(db, uuid.UUID(artifact_id))
    if not artifact or not artifact.pdf_storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No PDF stored")

    pdf_name = (artifact.filename or "document").replace(".tex", "") + ".pdf"
    url = await storage_service.get_pdf_url(artifact.pdf_storage_path, pdf_name, inline)
    return {"url": url, "filename": pdf_name}


@router.delete("/{artifact_id}")
async def delete_file(
    artifact_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    artifact = await jobs_service.get_artifact(db, uuid.UUID(artifact_id))
    if artifact and artifact.pdf_storage_path:
        await storage_service.delete_pdf(artifact.pdf_storage_path)
    return {"ok": True}
