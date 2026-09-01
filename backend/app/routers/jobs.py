import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.job import (
    JobCreate,
    JobUpdate,
    JobOut,
    JobDetailOut,
    JobSearchParams,
    BulkStatusUpdate,
    BulkDelete,
    JobArtifactCreate,
    JobArtifactOut,
)
from app.models.job import Job, JobStatus, ArtifactKind
from app.services import jobs as jobs_service
from app.services import workspace as workspace_service
from app.services import company as company_service
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


async def get_workspace_id(user: dict, db: AsyncSession) -> uuid.UUID:
    ws = await workspace_service.get_workspace_for_user(db, uuid.UUID(user["user_id"]))
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return ws.id


@router.get("/", response_model=list[JobOut])
async def list_jobs(
    board_id: uuid.UUID | None = None,
    search: str | None = None,
    status: str | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    status_enum = JobStatus(status) if status else None
    return await jobs_service.list_jobs(db, ws_id, board_id, search, status_enum)


@router.get("/export")
async def export_jobs(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import io
    from datetime import datetime as _dt

    from fastapi.responses import StreamingResponse
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    ws_id = await get_workspace_id(user, db)
    jobs = await jobs_service.list_jobs(db, ws_id)

    headers = [
        "Company", "Title", "Location", "Status", "Date Applied",
        "Company Domain", "Job URL", "Resume Score", "Notes", "Description",
        "Insights", "Base Fit Score", "Created At", "Updated At",
    ]

    def _flatten(value):
        if value is None:
            return ""
        if isinstance(value, dict):
            return "\n".join(f"{k}: {v}" for k, v in value.items())
        if isinstance(value, list):
            return ", ".join(str(x) for x in value)
        return str(value)

    wb = Workbook()
    ws = wb.active
    ws.title = "Jobs"

    thin = Side(style="thin", color="D1D5DB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill("solid", fgColor="1F2937")
    header_font = Font(bold=True, color="FFFFFF")

    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.border = border
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for job in jobs:
        ws.append([
            job.company or "",
            job.title or "",
            job.location or "",
            job.status or "",
            str(job.date_applied) if job.date_applied else "",
            job.company_domain or "",
            job.url or "",
            job.resume_score if job.resume_score is not None else "",
            job.notes or "",
            job.description or "",
            _flatten(job.insights),
            _flatten(job.base_fit_score),
            str(job.created_at) if job.created_at else "",
            str(job.updated_at) if job.updated_at else "",
        ])

    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=1, max_col=len(headers)):
        for cell in row:
            cell.border = border
            cell.alignment = Alignment(vertical="top", wrap_text=True)

    for i, w in enumerate([18, 22, 16, 12, 13, 20, 30, 13, 30, 50, 40, 40, 22, 22], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ws.max_row}"

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"jobforge_jobs_{_dt.now():%Y-%m-%d}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{job_id}", response_model=JobDetailOut)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await jobs_service.get_job_detail(db, job_id)


@router.get("/{job_id}/company-info")
async def get_company_info(
    job_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.workspace_id == ws_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    domain = company_service.resolve_domain(
        company=job.company, domain=job.company_domain, url=job.url
    )
    website = f"https://{domain}"

    description = await company_service.fetch_website_description(domain)
    if description:
        return {
            "company": job.company,
            "domain": domain,
            "website": website,
            "description": description,
            "url": None,
            "source": "website",
        }

    wiki = await company_service.wikipedia_lookup(job.company, domain)
    if wiki:
        return {
            "company": job.company,
            "domain": domain,
            "website": website,
            "description": wiki["description"],
            "url": wiki.get("url"),
            "source": "wikipedia",
        }

    return {
        "company": job.company,
        "domain": domain,
        "website": website,
        "description": None,
        "url": None,
        "source": None,
    }


@router.post("/", response_model=JobOut)
async def create_job(
    data: JobCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    job = await jobs_service.create_job(
        db,
        workspace_id=ws_id,
        board_id=data.board_id,
        company=data.company,
        title=data.title,
        description=data.description or "",
        url=data.url,
        notes=data.notes,
        location=data.location,
        status=data.status,
        date_applied=str(data.date_applied) if data.date_applied else None,
        resume_score=data.resume_score,
        company_domain=data.company_domain,
    )
    await db.refresh(job)
    return job


@router.put("/{job_id}")
async def update_job(
    job_id: uuid.UUID,
    data: JobUpdate,
    db: AsyncSession = Depends(get_db),
):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    await jobs_service.update_job(db, job_id, **updates)
    return {"ok": True}


@router.delete("/{job_id}")
async def delete_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    await jobs_service.delete_job(db, job_id)
    return {"ok": True}


@router.post("/bulk-status")
async def bulk_update_status(
    data: BulkStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    await jobs_service.bulk_update_status(db, data.ids, data.status)
    return {"ok": True}


@router.post("/bulk-delete")
async def bulk_delete_jobs(
    data: BulkDelete,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    count = await jobs_service.bulk_delete_jobs(db, ws_id, data.ids)
    return {"ok": True, "count": count}


@router.get("/artifacts/{job_id}", response_model=list[JobArtifactOut])
async def list_artifacts(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    detail = await jobs_service.get_job_detail(db, job_id)
    return detail["artifacts"]


@router.post("/artifacts", response_model=JobArtifactOut)
async def create_artifact(
    data: JobArtifactCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_id = await get_workspace_id(user, db)
    artifact = await jobs_service.create_artifact(
        db,
        workspace_id=ws_id,
        job_id=data.job_id,
        kind=ArtifactKind(data.kind.value),
        filename=data.filename,
        latex_source=data.latex_source,
    )
    await db.refresh(artifact)
    return artifact


@router.delete("/artifacts/{artifact_id}")
async def delete_artifact(
    artifact_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    await jobs_service.delete_artifact(db, artifact_id)
    return {"ok": True}


class ArtifactUpdateRequest(BaseModel):
    latex_source: str


@router.patch("/artifacts/{artifact_id}")
async def update_artifact(
    artifact_id: uuid.UUID,
    data: ArtifactUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        art = await jobs_service.update_artifact_source(db, artifact_id, data.latex_source)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if not art:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    return {"ok": True}
