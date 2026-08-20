from app.celery_app import celery_app
from app.services.email import send_email
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.config import settings


@celery_app.task()
def send_daily_digest():
    engine = create_engine(settings.DATABASE_URL_SYNC)
    session = Session(engine)

    try:
        now = datetime.now(timezone.utc)
        since = now - timedelta(hours=12)

        from app.models.workspace import Workspace
        from app.models.job import Job, JobStatus
        from app.models.resume import ResumeVersion
        from app.models.ai_cost_log import AICostLog
        from app.models.user import User

        workspaces = session.query(Workspace).order_by(Workspace.created_at).all()

        for ws in workspaces:
            user = session.query(User).filter(User.id == ws.owner_user_id).first()
            if not user or not user.email:
                continue

            jobs_added = session.query(Job).filter(
                Job.workspace_id == ws.id,
                Job.created_at >= since,
            ).count()

            jobs_applied = session.query(Job).filter(
                Job.workspace_id == ws.id,
                Job.updated_at >= since,
                Job.status == JobStatus.APPLIED,
            ).count()

            jobs_interview = session.query(Job).filter(
                Job.workspace_id == ws.id,
                Job.updated_at >= since,
                Job.status == JobStatus.INTERVIEW,
            ).count()

            resumes = session.query(ResumeVersion).filter(
                ResumeVersion.workspace_id == ws.id,
                ResumeVersion.created_at >= since,
            ).count()

            costs = session.query(AICostLog).filter(
                AICostLog.workspace_id == ws.id,
                AICostLog.created_at >= since,
            ).all()
            total_cost = sum(float(c.total_cost or 0) for c in costs)

            # Send the digest daily even when every count is zero.
            html = f"""
            <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
                <h2 style="margin:0 0 4px;color:#00008c">JobForge digest</h2>
                <p style="margin:0 0 20px;color:#64748b;font-size:13px">{ws.name} · Last 12 hours</p>
                <table style="width:100%;border-collapse:collapse;font-size:15px">
                    <tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0">Jobs added</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#00a698">{jobs_added}</td></tr>
                    <tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0">Applied</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#00a698">{jobs_applied}</td></tr>
                    <tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0">Moved to interview</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#00a698">{jobs_interview}</td></tr>
                    <tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0">Resume versions</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#00a698">{resumes}</td></tr>
                    <tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0">AI cost</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#00a698">${total_cost:.4f}</td></tr>
                </table>
                <p style="margin-top:24px;font-size:12px;color:#94a3b8">Automated digest from JobForge</p>
            </div>"""

            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(
                send_email(user.email, "digest", body_html=html, workspace_name=ws.name)
            )
            loop.close()
    finally:
        session.close()
        engine.dispose()
