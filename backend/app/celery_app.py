from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "jobforgex",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    # Explicit module list. `autodiscover_tasks(["app.tasks"])` only imports `app.tasks.tasks`
    # (which doesn't exist), so before this nothing was ever registered with the worker.
    # Add new task modules here.
    include=[
        "app.tasks.digest",
        "app.tasks.email",
    ],
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

# Queue routing skeleton for the upcoming pipeline / gmail / discovery work. Tasks that are
# not matched here keep using the default "celery" queue, which the general worker consumes.
celery_app.conf.task_routes = {
    "app.tasks.pipeline.*": {"queue": "pipeline"},
    "app.tasks.gmail.*": {"queue": "gmail"},
    "app.tasks.discovery.*": {"queue": "discovery"},
}

celery_app.conf.beat_schedule = {}

if settings.DIGEST_ENABLED:
    celery_app.conf.beat_schedule.update(
        {
            "send-daily-digest-morning": {
                "task": "app.tasks.digest.send_daily_digest",
                "schedule": crontab(hour=1, minute=30),  # 7:00 AM IST = 1:30 AM UTC
            },
            "send-daily-digest-evening": {
                "task": "app.tasks.digest.send_daily_digest",
                "schedule": crontab(hour=12, minute=30),  # 6:00 PM IST = 12:30 PM UTC
            },
        }
    )
