"""Daily summary email for the instance admin(s), and only for them.

Scheduled in celery_app.py (18:00 IST) whenever ADMIN_EMAILS is set. Recipients are exactly the
addresses in ADMIN_EMAILS. Content is metadata only: who signed up, who was active, how many jobs
/ applications / AI calls, what failed. Never job titles, resumes or any user-written text.
"""
import asyncio
import html
from datetime import datetime, timedelta, timezone

from celery.utils.log import get_task_logger
from sqlalchemy import create_engine, func
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.config import settings
from app.services import instance_settings, ratelimit
from app.services.email import send_email, smtp_configured
from app.services.health import run_health_checks

logger = get_task_logger(__name__)

WINDOW_HOURS = 24
# A little under a day so tomorrow's run is never blocked by today's claim, but a redelivered
# task within the same run is.
DEDUPE_TTL_S = 20 * 3600


def collect_admin_stats(session: Session, since: datetime, now: datetime) -> dict:
    """Cross-workspace counts for the window. Pure reads; safe to call with any Session."""
    from app.models.admin import AIFailureLog
    from app.models.ai_cost_log import AICostLog
    from app.models.job import Job, JobArtifact
    from app.models.user import User
    from app.models.workspace import Workspace

    def grouped(model, ts_col, *extra):
        cols = [model.workspace_id, func.count(), *extra]
        return {
            row[0]: row[1:]
            for row in session.query(*cols).filter(ts_col >= since).group_by(model.workspace_id).all()
        }

    jobs_added = grouped(Job, Job.created_at)
    applied = grouped(Job, Job.applied_at)
    docs = grouped(JobArtifact, JobArtifact.created_at)
    ai = grouped(AICostLog, AICostLog.created_at, func.sum(AICostLog.total_cost))
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_spend = {
        ws_id: float(spent or 0)
        for ws_id, spent in session.query(AICostLog.workspace_id, func.sum(AICostLog.total_cost))
        .filter(AICostLog.created_at >= month_start)
        .group_by(AICostLog.workspace_id)
        .all()
    }
    default_cap = instance_settings.get_all_sync(session)["default_ai_monthly_cap_usd"]

    new_signups = []
    active = []
    for user, ws in session.query(User, Workspace).outerjoin(Workspace, Workspace.owner_user_id == User.id).all():
        if user.created_at and user.created_at >= since:
            new_signups.append({"email": user.email, "at": user.created_at})
        wid = ws.id if ws else None
        row = {
            "email": user.email,
            "jobs_added": jobs_added.get(wid, (0,))[0],
            "applied": applied.get(wid, (0,))[0],
            "docs": docs.get(wid, (0,))[0],
            "ai_calls": ai.get(wid, (0, 0))[0],
            "ai_cost": float(ai.get(wid, (0, 0))[1] or 0),
            "month_cost": month_spend.get(wid, 0.0),
        }
        cap = ws.admin_ai_cap_usd if ws and ws.admin_ai_cap_usd is not None else default_cap
        row["cap"] = float(cap) if cap is not None else None
        logged_in = bool(user.last_login_at and user.last_login_at >= since)
        did_something = any(row[k] for k in ("jobs_added", "applied", "docs", "ai_calls"))
        if logged_in or did_something:
            active.append(row)

    active.sort(key=lambda r: (r["ai_cost"], r["jobs_added"]), reverse=True)
    return {
        "total_users": session.query(User).count(),
        "new_signups": sorted(new_signups, key=lambda r: r["at"]),
        "active": active,
        "ai_failures": session.query(AIFailureLog).filter(AIFailureLog.created_at >= since).count(),
        "latex_failures": session.query(JobArtifact)
        .filter(JobArtifact.created_at >= since, JobArtifact.compile_error.isnot(None), JobArtifact.compile_error != "")
        .count(),
    }


def build_admin_summary_html(stats: dict, checks: list[dict], admin_url: str) -> str:
    """Pure: stats + health in, HTML out. Emails are user-controlled, so everything is escaped."""
    esc = html.escape
    cell = "padding:8px 6px;border-bottom:1px solid #e2e8f0;font-size:13px"
    head = "padding:6px;font-size:11px;text-transform:uppercase;color:#64748b;text-align:right"

    failing = [c for c in checks if not c["ok"]]
    banner = ""
    if failing:
        items = "".join(f"<li><b>{esc(c['name'])}</b>: {esc(c['detail'] or 'down')}</li>" for c in failing)
        banner = (
            '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;'
            f'margin-bottom:20px;color:#991b1b;font-size:14px"><b>Needs attention</b><ul style="margin:6px 0 0 18px;padding:0">{items}</ul></div>'
        )

    signups = "".join(
        f'<li style="margin:2px 0">{esc(s["email"])} <span style="color:#94a3b8">{s["at"]:%H:%M} UTC</span></li>'
        for s in stats["new_signups"]
    ) or '<li style="color:#94a3b8">None</li>'

    def money(v: float) -> str:
        return f"${v:.2f}"

    rows = ""
    for r in stats["active"]:
        over = r["cap"] is not None and r["month_cost"] >= r["cap"]
        month = money(r["month_cost"]) + (f" / {money(r['cap'])}" if r["cap"] is not None else "")
        month_style = "color:#b91c1c;font-weight:600" if over else ""
        rows += (
            f'<tr><td style="{cell}">{esc(r["email"])}</td>'
            f'<td style="{cell};text-align:right">{r["jobs_added"]}</td>'
            f'<td style="{cell};text-align:right">{r["applied"]}</td>'
            f'<td style="{cell};text-align:right">{r["docs"]}</td>'
            f'<td style="{cell};text-align:right">{r["ai_calls"]}</td>'
            f'<td style="{cell};text-align:right;{month_style}">{esc(month)}</td></tr>'
        )
    if not rows:
        rows = f'<tr><td colspan="6" style="{cell};color:#94a3b8">Nobody was active.</td></tr>'

    return (
        '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#0f172a">'
        '<h2 style="margin:0 0 4px;color:#00008c">JobForge admin summary</h2>'
        f'<p style="margin:0 0 20px;color:#64748b;font-size:13px">Last {WINDOW_HOURS} hours · {stats["total_users"]} users in total</p>'
        f"{banner}"
        f'<h3 style="font-size:14px;margin:0 0 6px">New signups ({len(stats["new_signups"])})</h3>'
        f'<ul style="margin:0 0 20px 18px;padding:0;font-size:13px">{signups}</ul>'
        f'<h3 style="font-size:14px;margin:0 0 6px">Active users ({len(stats["active"])})</h3>'
        '<table style="width:100%;border-collapse:collapse"><tr>'
        f'<th style="{head};text-align:left">User</th><th style="{head}">Jobs added</th><th style="{head}">Applied</th>'
        f'<th style="{head}">Tailored docs</th><th style="{head}">AI calls</th><th style="{head}">AI this month</th></tr>'
        f"{rows}</table>"
        f'<p style="margin:20px 0 0;font-size:13px;color:#475569">Failures: {stats["ai_failures"]} AI, {stats["latex_failures"]} LaTeX compile.</p>'
        f'<p style="margin-top:16px"><a href="{esc(admin_url, quote=True)}" style="display:inline-block;padding:10px 20px;'
        'background:#00008c;color:#fff;border-radius:6px;text-decoration:none">Open admin dashboard</a></p>'
        '<p style="margin-top:24px;font-size:12px;color:#94a3b8">Counts and timestamps only, never job or resume content. '
        "You get this because you are listed in ADMIN_EMAILS; turn it off in Admin, Access.</p>"
        "</div>"
    )


@celery_app.task(name="app.tasks.admin_digest.send_admin_summary")
def send_admin_summary(force: bool = False) -> dict:
    """`force` is the dashboard's "send now" button: it ignores the toggle and the once-a-day guard."""
    result = {"sent": 0, "recipients": 0}
    recipients = settings.admin_emails
    if not recipients:
        return {**result, "error": "no_admins"}
    if not smtp_configured():
        logger.error("admin summary not sent: SMTP_USER / SMTP_PASS are not configured")
        return {**result, "error": "smtp_not_configured"}

    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=WINDOW_HOURS)
    engine = create_engine(settings.DATABASE_URL_SYNC)
    loop = asyncio.new_event_loop()
    claim = f"admin-summary:{now:%Y-%m-%d}"
    claimed = False
    try:
        with Session(engine) as session:
            if not force:
                if not instance_settings.get_all_sync(session)["notify_daily_summary"]:
                    return {**result, "error": "disabled"}
                if not ratelimit.claim_once(claim, DEDUPE_TTL_S):
                    return {**result, "error": "duplicate"}
                claimed = True
            stats = collect_admin_stats(session, since, now)

        checks = run_health_checks()
        body = build_admin_summary_html(stats, checks, f"{settings.FRONTEND_URL}/admin")
        failing = sum(1 for c in checks if not c["ok"])
        subject = f"JobForge admin: {len(stats['new_signups'])} new, {len(stats['active'])} active"
        if failing:
            subject = f"[{failing} issue{'s' if failing != 1 else ''}] " + subject

        result["recipients"] = len(recipients)
        for to in recipients:
            if loop.run_until_complete(send_email(to, "admin_daily_summary", subject=subject, body_html=body)):
                result["sent"] += 1
        if claimed and result["sent"] == 0:
            ratelimit.release_claim(claim)  # nothing went out, so let a retry try again
    except Exception:
        logger.exception("admin summary failed")
        if claimed:
            ratelimit.release_claim(claim)
        return {**result, "error": "exception"}
    finally:
        loop.close()
        engine.dispose()

    logger.info("admin summary: %s", result)
    return result
