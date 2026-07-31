import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import settings

TEMPLATES = {
    "email_verification": {
        "subject": "Verify your email — JobForge",
        "body_html": """
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#0f172a">
                <div style="text-align:center;margin-bottom:24px">
                    <img src="https://jobforge.helixos.pro/logo.png" alt="JobForge" style="width:48px;height:48px" />
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
                    <img src="https://jobforge.helixos.pro/logo.png" alt="JobForge" style="width:48px;height:48px" />
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
                    <img src="https://jobforge.helixos.pro/logo.png" alt="JobForge" style="width:48px;height:48px" />
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
                    <img src="https://jobforge.helixos.pro/logo.png" alt="JobForge" style="width:48px;height:48px" />
                </div>
                <h2 style="color:#dc2626;margin:0 0 12px">Account deleted</h2>
                <p>Your JobForge account and all associated data (workspaces, jobs, resumes, cover letters) have been permanently deleted.</p>
                <p style="color:#64748b;font-size:14px">If you change your mind, you can create a new account at any time.</p>
                <a href="{frontend_url}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none;margin:12px 0">Create new account</a>
                <p style="margin-top:24px;font-size:12px;color:#94a3b8">JobForge</p>
            </div>
        """,
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
    body = template["body_html"].format(**kwargs)

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
        return False
