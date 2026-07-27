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
                <h2 style="color:#00008c">Reset your password</h2>
                <p>Click the button below to set a new password.</p>
                <a href="{reset_url}" style="display:inline-block;padding:12px 24px;background:#00a698;color:#fff;border-radius:6px;text-decoration:none;margin:16px 0">Reset Password</a>
                <p style="color:#64748b;font-size:12px">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
            </div>
        """,
    },
}


async def send_email(to: str, template_name: str, **kwargs) -> bool:
    template = TEMPLATES.get(template_name)
    if not template:
        return False

    subject = template["subject"]
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
