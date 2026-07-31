from app.celery_app import celery_app
from app.services.email import send_email
from app.config import settings


@celery_app.task(name="send_email_task")
def send_email_task(to: str, template_name: str, **kwargs):
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(send_email(to, template_name, **kwargs))
    finally:
        loop.close()


@celery_app.task(name="send_welcome_email")
def send_welcome_email(user_email: str):
    frontend_url = settings.FRONTEND_URL
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(
            send_email(user_email, "welcome", frontend_url=frontend_url)
        )
    finally:
        loop.close()


@celery_app.task(name="send_account_deleted")
def send_account_deleted(user_email: str):
    frontend_url = settings.FRONTEND_URL
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(
            send_email(user_email, "account_deleted", frontend_url=frontend_url)
        )
    finally:
        loop.close()
