import uuid
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume import Resume, ResumeVersion


async def list_resumes(db: AsyncSession, workspace_id: uuid.UUID) -> list[Resume]:
    result = await db.execute(
        select(Resume).where(Resume.workspace_id == workspace_id).order_by(Resume.updated_at.desc())
    )
    return list(result.scalars().all())


async def get_base_resume(db: AsyncSession, workspace_id: uuid.UUID) -> Resume | None:
    result = await db.execute(
        select(Resume).where(Resume.workspace_id == workspace_id, Resume.is_base == True).limit(1)
    )
    return result.scalar_one_or_none()


async def create_or_update_base_resume(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    latex_source: str,
    name: str = "My Resume",
    page_count: int = 0,
) -> Resume:
    existing = await db.execute(
        select(Resume).where(Resume.workspace_id == workspace_id, Resume.is_base == True).limit(1)
    )
    resume = existing.scalar_one_or_none()
    
    if resume:
        resume.latex_source = latex_source
        resume.page_count = page_count
    else:
        resume = Resume(
            workspace_id=workspace_id,
            name=name,
            latex_source=latex_source,
            page_count=page_count,
            is_base=True,
        )
        db.add(resume)
    await db.flush()

    version = ResumeVersion(
        resume_id=resume.id,
        workspace_id=workspace_id,
        latex_source=latex_source,
        note="Initial version",
    )
    db.add(version)
    await db.flush()
    return resume


async def update_resume_colors(
    db: AsyncSession, resume_id: uuid.UUID, primary_color: str, secondary_color: str
) -> None:
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if resume:
        resume.primary_color = primary_color
        resume.secondary_color = secondary_color
        await db.flush()


async def list_resume_versions(db: AsyncSession, resume_id: uuid.UUID) -> list[ResumeVersion]:
    result = await db.execute(
        select(ResumeVersion)
        .where(ResumeVersion.resume_id == resume_id)
        .order_by(ResumeVersion.created_at.desc())
    )
    return list(result.scalars().all())


async def restore_resume_version(db: AsyncSession, version_id: uuid.UUID) -> ResumeVersion | None:
    result = await db.execute(select(ResumeVersion).where(ResumeVersion.id == version_id))
    version = result.scalar_one_or_none()
    if not version:
        return None

    resume_result = await db.execute(select(Resume).where(Resume.id == version.resume_id))
    resume = resume_result.scalar_one_or_none()
    if resume:
        resume.latex_source = version.latex_source
        await db.flush()
    return version
