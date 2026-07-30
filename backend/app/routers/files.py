from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import io
import uuid

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


@router.get("/stream/{artifact_id}")
async def stream_pdf(
    artifact_id: str,
    inline: bool = True,
    db: AsyncSession = Depends(get_db),
):
    artifact = await jobs_service.get_artifact(db, uuid.UUID(artifact_id))
    if not artifact or not artifact.pdf_storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No PDF stored")

    pdf_name = (artifact.filename or "document").replace(".tex", "") + ".pdf"
    try:
        pdf_bytes = await storage_service.get_pdf_bytes(artifact.pdf_storage_path)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    disposition = "inline" if inline else f'attachment; filename="{pdf_name}"'
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": disposition},
    )
