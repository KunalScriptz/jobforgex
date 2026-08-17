from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "jobforgex",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    worker_max_tasks_per_child=200,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

celery_app.conf.beat_schedule = {
    "send-daily-digest-morning": {
        "task": "app.tasks.digest.send_daily_digest",
        "schedule": crontab(hour=1, minute=30),  # 7:00 AM IST = 1:30 AM UTC
    },
    "send-daily-digest-evening": {
        "task": "app.tasks.digest.send_daily_digest",
        "schedule": crontab(hour=12, minute=30),  # 6:00 PM IST = 12:30 PM UTC
    },
    "reconcile-usage-periods": {
        "task": "reconcile_usage_periods",
        "schedule": crontab(hour=2, minute=0),  # 2:00 AM UTC daily
    },
}


celery_app.autodiscover_tasks(["app.tasks"])
