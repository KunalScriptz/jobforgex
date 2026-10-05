"""Twice-daily activity digest email.

Scheduled in celery_app.py (07:00 and 18:00 IST) and only when DIGEST_ENABLED is true.
It is sent even when every count is zero, to every workspace owner who has not opted out
(users.digest_enabled), at most once per half-day slot per workspace.
"""
import asyncio
import html
from datetime import date, datetime, timedelta, timezone

from celery.utils.log import get_task_logger
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.config import settings
from app.services import ratelimit
from app.services.auth import create_digest_unsubscribe_token
from app.services.email import send_email

logger = get_task_logger(__name__)

WINDOW_HOURS = 12
# Slightly under 24h: long enough to swallow a redelivered task, short enough that the next
# day's slot is never blocked by yesterday's claim.
DEDUPE_TTL_S = 20 * 3600


def _slot(now: datetime) -> str:
    """Half-day slot id: the 01:30 UTC run is 'am', the 12:30 UTC run is 'pm'."""
    return f"{now:%Y-%m-%d}-{'am' if now.hour < 6 else 'pm'}"


def collect_stats(session: Session, workspace_id, since: datetime, today: date | None = None) -> dict:
    """Counts for the window. Applied / replies / interviews come from the lifecycle timestamps
    that services/job_state.py stamps when a card moves, so they mean "moved in the window", not
    "touched in the window". `today` is the workspace-local date used for follow-ups due."""
    from app.models.ai_cost_log import AICostLog
    from app.models.job import Job
    from app.models.resume import ResumeVersion
    from app.services.job_state import FOLLOW_UP_STATUSES

    def count_jobs(*conditions) -> int:
        return session.query(Job).filter(Job.workspace_id == workspace_id, *conditions).count()

    costs = session.query(AICostLog).filter(
        AICostLog.workspace_id == workspace_id, AICostLog.created_at >= since
    ).all()
    today = today or datetime.now(timezone.utc).date()
    return {
        "jobs_added": count_jobs(Job.created_at >= since),
        "applied": count_jobs(Job.applied_at >= since),
        "replies": count_jobs(Job.last_reply_at >= since),
        "interview": count_jobs(Job.interview_at >= since),
        "follow_ups_due": count_jobs(
            Job.status.in_(FOLLOW_UP_STATUSES), Job.follow_up_at.isnot(None), Job.follow_up_at <= today
        ),
        "resume_versions": session.query(ResumeVersion).filter(
            ResumeVersion.workspace_id == workspace_id, ResumeVersion.created_at >= since
        ).count(),
        "ai_cost": sum(float(c.total_cost or 0) for c in costs),
    }


def build_digest_html(workspace_name: str, stats: dict, unsubscribe_url: str) -> str:
    """Pure: stats in, HTML out. The workspace name is user-controlled, so it is escaped."""
    esc = html.escape
    cell = "padding:10px 0;border-bottom:1px solid #e2e8f0"
    rows = [
        ("Jobs added", str(stats["jobs_added"])),
        ("Applied", str(stats["applied"])),
        ("Replies", str(stats["replies"])),
        ("Moved to interview", str(stats["interview"])),
        ("Follow-ups due", str(stats["follow_ups_due"])),
        ("Resume versions", str(stats["resume_versions"])),
        ("AI cost", f"${stats['ai_cost']:.4f}"),
    ]
    body_rows = "".join(
        f'<tr><td style="{cell}">{esc(label)}</td>'
        f'<td style="{cell};text-align:right;font-weight:600;color:#00a698">{esc(value)}</td></tr>'
        for label, value in rows
    )
    return (
        '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;'
        'padding:24px;color:#0f172a">'
        '<h2 style="margin:0 0 4px;color:#00008c">JobForge digest</h2>'
        f'<p style="margin:0 0 20px;color:#64748b;font-size:13px">{esc(workspace_name)} · Last {WINDOW_HOURS} hours</p>'
        f'<table style="width:100%;border-collapse:collapse;font-size:15px">{body_rows}</table>'
        '<p style="margin-top:24px;font-size:12px;color:#94a3b8">'
        "Automated digest from JobForge. "
        f'<a href="{esc(unsubscribe_url, quote=True)}" style="color:#94a3b8">Unsubscribe</a> '
        "or change this any time in Settings.</p>"
        "</div>"
    )


def _deliver(loop: asyncio.AbstractEventLoop, session: Session, ws, user, since: datetime) -> bool:
    from app.services.metrics import local_today

    stats = collect_stats(session, ws.id, since, local_today(datetime.now(timezone.utc), ws.timezone))
    token = create_digest_unsubscribe_token(str(user.id))
    unsubscribe_url = f"{settings.FRONTEND_URL}/unsubscribe?token={token}"
    body = build_digest_html(ws.name, stats, unsubscribe_url)
    # Collapse whitespace so a newline in a workspace name can't inject mail headers via Subject.
    subject_name = " ".join((ws.name or "").split())
    return bool(
        loop.run_until_complete(
            send_email(user.email, "digest", body_html=body, workspace_name=subject_name)
        )
    )


def _recipients(session: Session):
    """(workspace, owner) pairs: each user's oldest workspace only (the app's 'current' one)."""
    from app.models.user import User
    from app.models.workspace import Workspace

    seen: set = set()
    rows = (
        session.query(Workspace, User)
        .join(User, User.id == Workspace.owner_user_id)
        .order_by(Workspace.created_at)
        .all()
    )
    for ws, user in rows:
        if not user.email or user.id in seen:
            continue
        seen.add(user.id)
        yield ws, user


def _smtp_configured() -> bool:
    return bool(settings.SMTP_USER and settings.SMTP_PASS)


@celery_app.task(name="app.tasks.digest.send_daily_digest")
def send_daily_digest() -> dict:
    summary = {"workspaces": 0, "sent": 0, "skipped_opt_out": 0, "skipped_duplicate": 0, "failed": 0}

    if not _smtp_configured():
        logger.error("digest not sent: SMTP_USER / SMTP_PASS are not configured")
        return {**summary, "error": "smtp_not_configured"}

    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=WINDOW_HOURS)
    slot = _slot(now)

    engine = create_engine(settings.DATABASE_URL_SYNC)
    loop = asyncio.new_event_loop()
    try:
        with Session(engine) as session:
            for ws, user in _recipients(session):
                summary["workspaces"] += 1
                if not user.digest_enabled:
                    summary["skipped_opt_out"] += 1
                    continue

                claim = f"digest:{ws.id}:{slot}"
                if not ratelimit.claim_once(claim, DEDUPE_TTL_S):
                    summary["skipped_duplicate"] += 1
                    continue

                try:
                    ok = _deliver(loop, session, ws, user, since)
                except Exception:
                    logger.exception("digest failed for workspace %s", ws.id)
                    ok = False

                if ok:
                    summary["sent"] += 1
                else:
                    summary["failed"] += 1
                    ratelimit.release_claim(claim)  # let a retry/redelivery try again
    finally:
        loop.close()
        engine.dispose()

    logger.info("digest summary: %s", summary)
    return summary


@celery_app.task(name="app.tasks.digest.send_digest_for_user")
def send_digest_for_user(user_id: str) -> dict:
    """The 'send me a test digest' button. An explicit request, so it ignores the opt-out flag
    and the once-per-slot guard."""
    import uuid

    from app.models.user import User
    from app.models.workspace import Workspace

    if not _smtp_configured():
        logger.error("test digest not sent: SMTP_USER / SMTP_PASS are not configured")
        return {"sent": False, "error": "smtp_not_configured"}

    since = datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)
    engine = create_engine(settings.DATABASE_URL_SYNC)
    loop = asyncio.new_event_loop()
    try:
        with Session(engine) as session:
            user = session.get(User, uuid.UUID(user_id))
            ws = (
                session.query(Workspace)
                .filter(Workspace.owner_user_id == uuid.UUID(user_id))
                .order_by(Workspace.created_at)
                .first()
            )
            if not user or not user.email or not ws:
                return {"sent": False, "error": "no_workspace"}
            ok = _deliver(loop, session, ws, user, since)
    except Exception:
        logger.exception("test digest failed for user %s", user_id)
        return {"sent": False, "error": "exception"}
    finally:
        loop.close()
        engine.dispose()

    logger.info("test digest for user %s: sent=%s", user_id, ok)
    return {"sent": ok}
