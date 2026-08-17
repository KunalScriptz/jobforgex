from datetime import date, datetime, timezone

import structlog
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.config import settings
from app.models.subscription import Subscription
from app.models.usage import UserUsage

logger = structlog.get_logger()


def _calendar_month(now: datetime) -> tuple[date, date]:
    start = date(now.year, now.month, 1)
    end = date(now.year + 1, 1, 1) if now.month == 12 else date(now.year, now.month + 1, 1)
    return start, end


@celery_app.task(name="reconcile_usage_periods")
def reconcile_usage_periods():
    """Daily reconciliation for the per-period `user_usage` table.

    Usage rows are created lazily on first increment, so this task isn't a
    zeroing cron — it (1) pre-creates the next period's row on billing
    rollover so dashboards don't show a transient empty state, and (2) flags
    active paid subscriptions whose `current_period_end` has passed with no
    renewal webhook received, which would otherwise silently strand a user
    on stale usage limits until the next webhook retry.
    """
    engine = create_engine(settings.DATABASE_URL_SYNC)
    session = Session(engine)
    try:
        now = datetime.now(timezone.utc)
        subs = session.query(Subscription).filter(Subscription.plan_id.isnot(None)).all()

        for sub in subs:
            if (
                sub.plan_id
                and sub.plan_id != "free"
                and sub.subscription_status == "active"
                and sub.current_period_end
                and sub.current_period_end < now
            ):
                logger.warning(
                    "usage_reset.missed_renewal_webhook",
                    subscription_id=str(sub.id),
                    user_id=str(sub.user_id),
                    current_period_end=sub.current_period_end.isoformat(),
                )
                continue

            if sub.current_period_start and sub.current_period_end and sub.subscription_status == "active":
                period_start = sub.current_period_start.date()
                period_end = sub.current_period_end.date()
            else:
                period_start, period_end = _calendar_month(now)

            existing = (
                session.query(UserUsage)
                .filter(UserUsage.user_id == sub.user_id, UserUsage.period_start == period_start)
                .first()
            )
            if not existing:
                session.add(UserUsage(user_id=sub.user_id, period_start=period_start, period_end=period_end))

        session.commit()
    finally:
        session.close()
        engine.dispose()
