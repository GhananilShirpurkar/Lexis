import json
import logging
from typing import Optional, Any, Callable
import redis.asyncio as redis
from app.config import settings

logger = logging.getLogger("lexis.cache")

# Initialize async redis client
redis_client = redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,  # Automatic UTF-8 decoding for strings/JSON
    socket_connect_timeout=3,
    socket_timeout=3,
    health_check_interval=30
)

class Cache:
    @staticmethod
    async def ping() -> bool:
        try:
            return await redis_client.ping()
        except Exception as e:
            logger.warning(f"Redis ping failed: {str(e)}")
            return False

    @staticmethod
    async def get(key: str) -> Optional[Any]:
        try:
            data = await redis_client.get(key)
            if data is not None:
                return json.loads(data)
        except Exception as e:
            logger.warning(f"Redis GET failed for key {key}: {str(e)}")
        return None

    @staticmethod
    async def set(key: str, value: Any, ttl: int = 120) -> bool:
        try:
            serialized = json.dumps(value, default=str)
            await redis_client.setex(key, ttl, serialized)
            return True
        except Exception as e:
            logger.warning(f"Redis SET failed for key {key}: {str(e)}")
            return False

    @staticmethod
    async def delete(key: str) -> bool:
        try:
            await redis_client.delete(key)
            return True
        except Exception as e:
            logger.warning(f"Redis DELETE failed for key {key}: {str(e)}")
            return False

    @staticmethod
    async def delete_pattern(pattern: str) -> int:
        try:
            deleted_count = 0
            async for key in redis_client.scan_iter(match=pattern, count=100):
                await redis_client.delete(key)
                deleted_count += 1
            return deleted_count
        except Exception as e:
            logger.warning(f"Redis DELETE_PATTERN failed for pattern {pattern}: {str(e)}")
            return 0

    @staticmethod
    async def increment(key: str) -> Optional[int]:
        try:
            return await redis_client.incr(key)
        except Exception as e:
            logger.warning(f"Redis INCR failed for key {key}: {str(e)}")
            return None

    @staticmethod
    async def get_with_fallback(key: str, db_fetch_fn: Callable, ttl: int = 120) -> Any:
        # 1. Try cache hit
        cached = await Cache.get(key)
        if cached is not None:
            return cached

        # 2. Cache miss or Redis down — fetch from DB/function
        result = await db_fetch_fn()

        # 3. Only attempt caching if result is present
        if result is not None:
            await Cache.set(key, result, ttl=ttl)

        return result

cache = Cache()
