import logging
import smtplib
import ssl
import textwrap
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import settings

logger = logging.getLogger(__name__)

TEMPLATES = {
    "email_verification": {
        "subject": "Verify your email — JobForge",
        "body_html": """
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#0f172a">
                <div style="text-align:center;margin-bottom:24px">
                    <img src="https://jobforgeapi.helixos.pro/logo.png" alt="JobForge" style="width:48px;height:48px" />
                </div>
                <h2 style="color:#00008c">Verify your email</h2>
                <p>Click the button below to verify your email address.</p>
                <a href="{verification_url}" style="display:inline-block;padding:12px 24px;background:#00008c;color:#fff;border-radius:6px;text-decoration:none;margin:16px 0">Verify Email</a>
                <p style="color:#64748b;font-size:12px">This link expires in 24 hours.</p>
            </div>
        """,
    },
    "password_reset": {
        "subject": "Reset your password — JobForge",
        "body_html": """
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#0f172a">
                <div style="text-align:center;margin-bottom:24px">
                    <img src="https://jobforgeapi.helixos.pro/logo.png" alt="JobForge" style="width:48px;height:48px" />
                </div>
                <h2 style="color:#00008c">Reset your password</h2>
                <p>Click the button below to set a new password.</p>
                <a href="{reset_url}" style="display:inline-block;padding:12px 24px;background:#00a698;color:#fff;border-radius:6px;text-decoration:none;margin:16px 0">Reset Password</a>
                <p style="color:#64748b;font-size:12px">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
            </div>
        """,
    },
    "welcome": {
        "subject": "Welcome to JobForge",
        "body_html": """
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#0f172a">
                <div style="text-align:center;margin-bottom:24px">
                    <img src="https://jobforgeapi.helixos.pro/logo.png" alt="JobForge" style="width:48px;height:48px" />
                </div>
                <h2 style="color:#00008c;margin:0 0 4px">Welcome to JobForge</h2>
                <p style="color:#64748b;font-size:14px;margin:0 0 24px">Your AI-powered job application command center.</p>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px">
                    <p style="margin:0 0 12px;font-weight:600">Here's what you can do:</p>
                    <table style="width:100%;font-size:14px;border-collapse:collapse">
                        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">&#128203; Save jobs from any job board</td></tr>
                        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">&#129668; Generate tailored resumes with AI</td></tr>
                        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">&#9997; Create custom cover letters</td></tr>
                        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">&#128200; Track applications on a Kanban board</td></tr>
                        <tr><td style="padding:8px 0">&#9889; ATS score checker</td></tr>
                    </table>
                </div>
                <p style="margin:0 0 8px;font-size:13px;color:#475569">Complete your setup by uploading your base resume:</p>
                <a href="{frontend_url}/onboarding" style="display:inline-block;padding:12px 24px;background:#00008c;color:#fff;border-radius:6px;text-decoration:none;margin:8px 0">Complete setup</a>
                <p style="margin-top:24px;font-size:12px;color:#94a3b8">JobForge — Job search, structured.</p>
            </div>
        """,
    },
    "account_deleted": {
        "subject": "Your JobForge account has been deleted",
        "body_html": """
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#0f172a">
                <div style="text-align:center;margin-bottom:24px">
                    <img src="https://jobforgeapi.helixos.pro/logo.png" alt="JobForge" style="width:48px;height:48px" />
                </div>
                <h2 style="color:#dc2626;margin:0 0 12px">Account deleted</h2>
                <p>Your JobForge account and all associated data (workspaces, jobs, resumes, cover letters) have been permanently deleted.</p>
                <p style="color:#64748b;font-size:14px">If you change your mind, you can create a new account at any time.</p>
                <a href="{frontend_url}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none;margin:12px 0">Create new account</a>
                <p style="margin-top:24px;font-size:12px;color:#94a3b8">JobForge</p>
            </div>
        """,
    },
    "admin_new_signup": {
        "subject": "New JobForge signup: {email}",
        "body_html": """
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#0f172a">
                <h2 style="color:#00008c;margin:0 0 12px">New signup</h2>
                <table style="width:100%;font-size:14px;border-collapse:collapse">
                    <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0">{email}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">Name</td><td style="padding:6px 0">{name}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">When</td><td style="padding:6px 0">{when}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">Total users</td><td style="padding:6px 0">{total_users}</td></tr>
                </table>
                <a href="{admin_url}" style="display:inline-block;padding:10px 20px;background:#00008c;color:#fff;border-radius:6px;text-decoration:none;margin:16px 0">Open admin dashboard</a>
                <p style="font-size:12px;color:#94a3b8">You get this because you are listed in ADMIN_EMAILS. Turn it off in Admin, Access.</p>
            </div>
        """,
    },
    "admin_signup_blocked": {
        "subject": "Blocked signup attempt: {email}",
        "body_html": """
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#0f172a">
                <h2 style="color:#b45309;margin:0 0 12px">Signup blocked</h2>
                <p style="font-size:14px"><b>{email}</b> tried to sign up at {when}, but signups are <b>{reason}</b> on this instance.</p>
                <p style="font-size:14px">If you know them, add the email to the allowlist and ask them to try again.</p>
                <a href="{admin_url}" style="display:inline-block;padding:10px 20px;background:#00008c;color:#fff;border-radius:6px;text-decoration:none;margin:16px 0">Open Access settings</a>
                <p style="font-size:12px;color:#94a3b8">You get this because you are listed in ADMIN_EMAILS. Turn it off in Admin, Access.</p>
            </div>
        """,
    },
    "admin_daily_summary": {
        "subject": "{subject}",
        "body_html": "{body_html}",
    },
    "digest": {
        "subject": "JobForge digest — {workspace_name}",
        "body_html": "{body_html}",
    },
}


async def send_email(to: str, template_name: str, **kwargs) -> bool:
    template = TEMPLATES.get(template_name)
    if not template:
        return False

    subject = template["subject"].format(**kwargs)
    body = textwrap.dedent(template["body_html"]).format(**kwargs).strip()

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "html"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=context) as server:
            server.login(settings.SMTP_USER, settings.SMTP_PASS)
            server.sendmail(settings.SMTP_FROM, to, msg.as_string())
        return True
    except Exception:
        logger.exception("SMTP send failed to %s", to)
        return False


def smtp_configured() -> bool:
    return bool(settings.SMTP_USER and settings.SMTP_PASS)


def send_email_background(to: str, template_name: str, **kwargs):
    """Send an email from a daemon thread so it never blocks the response (and needs no Celery)."""
    import asyncio
    import threading

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(send_email(to, template_name, **kwargs))
        finally:
            loop.close()

    threading.Thread(target=_run, daemon=True).start()


def notify_admins_background(template_name: str, **kwargs) -> int:
    """Email every address in ADMIN_EMAILS (and nobody else). Returns how many were queued; zero
    when no admin is configured or SMTP isn't set up, so callers can fire and forget."""
    if not smtp_configured():
        return 0
    recipients = settings.admin_emails
    for to in recipients:
        send_email_background(to, template_name, **kwargs)
    return len(recipients)
