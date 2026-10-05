"""Tiny Redis-backed helpers: fixed-window rate limit and one-shot claims.

Both FAIL OPEN: if Redis is unreachable the caller proceeds. These guard against abuse and
duplicate sends, they are not a security boundary, and a Redis outage should not take features
down (the Celery broker is the same Redis, so anything that actually needs it fails elsewhere).
"""
import logging

import redis
import redis.asyncio as aredis

from app.config import settings

logger = logging.getLogger(__name__)


async def allow(key: str, limit: int, window_s: int) -> bool:
    """True if this call is within `limit` calls per `window_s` seconds for `key`."""
    client = aredis.from_url(settings.REDIS_URL, socket_timeout=2, socket_connect_timeout=2)
    try:
        count = await client.incr(f"rl:{key}")
        if count == 1:
            await client.expire(f"rl:{key}", window_s)
        return count <= limit
    except redis.RedisError:
        logger.warning("rate limiter unavailable, allowing request (key=%s)", key)
        return True
    finally:
        await client.aclose()


def claim_once(key: str, ttl_s: int) -> bool:
    """Sync (Celery side). True if this caller is the first to claim `key` within `ttl_s`."""
    client = redis.from_url(settings.REDIS_URL, socket_timeout=2, socket_connect_timeout=2)
    try:
        return bool(client.set(f"claim:{key}", "1", nx=True, ex=ttl_s))
    except redis.RedisError:
        logger.warning("claim store unavailable, proceeding without dedupe (key=%s)", key)
        return True
    finally:
        client.close()


def release_claim(key: str) -> None:
    """Undo claim_once() after a failed attempt so a retry may try again."""
    client = redis.from_url(settings.REDIS_URL, socket_timeout=2, socket_connect_timeout=2)
    try:
        client.delete(f"claim:{key}")
    except redis.RedisError:
        pass
    finally:
        client.close()
