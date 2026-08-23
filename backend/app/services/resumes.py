import uuid
from sqlalchemy import select, func, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume import Resume, ResumeVersion


async def list_resumes(db: AsyncSession, workspace_id: uuid.UUID) -> list[Resume]:
    result = await db.execute(
        select(Resume).where(Resume.workspace_id == workspace_id).order_by(Resume.updated_at.desc())
    )
    return list(result.scalars().all())


async def get_base_resume(db: AsyncSession, workspace_id: uuid.UUID) -> Resume | None:
    """The workspace default template (legacy "base resume")."""
    result = await db.execute(
        select(Resume)
        .where(Resume.workspace_id == workspace_id, Resume.is_default == True)
        .order_by(Resume.updated_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_resume(db: AsyncSession, workspace_id: uuid.UUID, resume_id: uuid.UUID) -> Resume | None:
    result = await db.execute(
        select(Resume).where(
            Resume.id == resume_id, Resume.workspace_id == workspace_id
        ).limit(1)
    )
    return result.scalar_one_or_none()


async def create_or_update_base_resume(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    latex_source: str,
    name: str = "My Resume",
    page_count: int = 0,
) -> Resume:
    """Legacy onboarding/resumes save path — upserts the default template."""
    existing = await db.execute(
        select(Resume).where(Resume.workspace_id == workspace_id, Resume.is_default == True).limit(1)
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
            is_base=False,
            is_default=True,
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


async def create_template(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    latex_source: str,
    name: str = "My Resume",
    primary_color: str = "#00008c",
    secondary_color: str = "#00a698",
) -> Resume:
    """Create a named template. Becomes default if the workspace has none yet."""
    has_default = await db.execute(
        select(Resume.id).where(Resume.workspace_id == workspace_id, Resume.is_default == True).limit(1)
    )
    make_default = has_default.scalar_one_or_none() is None

    resume = Resume(
        workspace_id=workspace_id,
        name=name,
        latex_source=latex_source,
        primary_color=primary_color,
        secondary_color=secondary_color,
        is_base=False,
        is_default=make_default,
    )
    db.add(resume)
    await db.flush()
    return resume


async def update_template(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    resume_id: uuid.UUID,
    *,
    name: str | None = None,
    latex_source: str | None = None,
    page_count: int | None = None,
    primary_color: str | None = None,
    secondary_color: str | None = None,
) -> Resume | None:
    resume = await get_resume(db, workspace_id, resume_id)
    if not resume:
        return None

    if name is not None:
        resume.name = name
    if page_count is not None:
        resume.page_count = page_count
    if primary_color is not None:
        resume.primary_color = primary_color
    if secondary_color is not None:
        resume.secondary_color = secondary_color

    if latex_source is not None and latex_source != resume.latex_source:
        resume.latex_source = latex_source
        version = ResumeVersion(
            resume_id=resume.id,
            workspace_id=workspace_id,
            latex_source=latex_source,
            note="Manual update",
        )
        db.add(version)

    await db.flush()
    return resume


async def delete_template(
    db: AsyncSession, workspace_id: uuid.UUID, resume_id: uuid.UUID
) -> str:
    """Returns "deleted" | "not_found" | "last_template"."""
    resume = await get_resume(db, workspace_id, resume_id)
    if not resume:
        return "not_found"

    count = await db.execute(
        select(func.count()).select_from(Resume).where(Resume.workspace_id == workspace_id)
    )
    if count.scalar_one() <= 1:
        return "last_template"

    if resume.is_default:
        # Promote the most recently updated remaining template in one atomic statement.
        await db.execute(
            sa_update(Resume)
            .where(
                Resume.workspace_id == workspace_id,
                Resume.id == select(Resume.id)
                .where(Resume.workspace_id == workspace_id, Resume.id != resume_id)
                .order_by(Resume.updated_at.desc())
                .limit(1)
                .scalar_subquery(),
            )
            .values(is_default=True)
        )

    await db.delete(resume)
    await db.flush()
    return "deleted"


async def set_default_template(
    db: AsyncSession, workspace_id: uuid.UUID, resume_id: uuid.UUID
) -> Resume | None:
    resume = await get_resume(db, workspace_id, resume_id)
    if not resume:
        return None

    await db.execute(
        sa_update(Resume)
        .where(Resume.workspace_id == workspace_id)
        .values(is_default=False)
    )
    resume.is_default = True
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
