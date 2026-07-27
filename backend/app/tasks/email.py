from app.celery_app import celery_app
from app.services.email import send_email
from app.config import settings


@celery_app.task(name="send_email_task")
def send_email_task(to: str, template_name: str, **kwargs):
    import asyncio
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(send_email(to, template_name, **kwargs))


@celery_app.task(name="send_welcome_email")
def send_welcome_email(user_email: str):
    import asyncio
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(
        send_email(user_email, "email_verification", verification_url="")
    )
