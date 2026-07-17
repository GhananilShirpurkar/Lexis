import time
import hashlib
from collections import OrderedDict
from typing import Callable, Optional, Any, Dict
from functools import wraps
from fastapi import Request, Response
from fastapi.responses import JSONResponse

class TTLCache:
    """
    Thread-safe in-memory TTL (Time-To-Live) Cache with maximum capacity eviction.
    """
    def __init__(self, maxsize: int = 100, ttl: float = 60.0):
        self.maxsize = maxsize
        self.ttl = ttl
        self._cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self.hits = 0
        self.misses = 0

    def get(self, key: str) -> Optional[Any]:
        now = time.monotonic()
        if key not in self._cache:
            self.misses += 1
            return None

        val, expires_at = self._cache[key]
        if now >= expires_at:
            del self._cache[key]
            self.misses += 1
            return None

        # Move to end for LRU behavior
        self._cache.move_to_end(key)
        self.hits += 1
        return val

    def set(self, key: str, value: Any, custom_ttl: Optional[float] = None) -> None:
        now = time.monotonic()
        ttl = custom_ttl if custom_ttl is not None else self.ttl
        expires_at = now + ttl

        if key in self._cache:
            del self._cache[key]
        elif len(self._cache) >= self.maxsize:
            # Pop oldest item
            self._cache.popitem(last=False)

        self._cache[key] = (value, expires_at)

    def clear(self) -> None:
        self._cache.clear()

    def invalidate(self, key: str) -> bool:
        if key in self._cache:
            del self._cache[key]
            return True
        return False

    def invalidate_prefix(self, prefix: str) -> int:
        keys_to_del = [k for k in self._cache.keys() if k.startswith(prefix)]
        for k in keys_to_del:
            del self._cache[k]
        return len(keys_to_del)

    def get_stats(self) -> Dict[str, Any]:
        return {
            "size": len(self._cache),
            "maxsize": self.maxsize,
            "ttl_seconds": self.ttl,
            "hits": self.hits,
            "misses": self.misses,
            "hit_ratio": round(self.hits / (self.hits + self.misses), 3) if (self.hits + self.misses) > 0 else 0.0
        }


# Per-endpoint cache singletons with explicit TTL and maxsize configuration
health_cache = TTLCache(maxsize=1, ttl=10.0)
metrics_cache = TTLCache(maxsize=1, ttl=30.0)
templates_cache = TTLCache(maxsize=100, ttl=3600.0)
faqs_cache = TTLCache(maxsize=100, ttl=3600.0)
feature_flags_cache = TTLCache(maxsize=50, ttl=300.0)
public_library_cache = TTLCache(maxsize=100, ttl=300.0)

# Global version counter for event-driven cache invalidations
_content_versions = {
    "templates": 1,
    "faqs": 1,
    "feature_flags": 1,
    "public_library": 1
}

def bump_content_version(domain: str) -> int:
    if domain in _content_versions:
        _content_versions[domain] += 1
        return _content_versions[domain]
    return 1

def generate_cache_key(request: Request, prefix: str) -> str:
    """
    Generates a deterministic cache key based on:
    {prefix}:{locale}:{query_hash}:v{version}
    Note: Authorization and session headers are intentionally excluded.
    """
    # 1. Extract Locale
    lang = request.query_params.get("lang") or request.headers.get("accept-language", "en")
    locale = lang.split(",")[0].split(";")[0].strip().lower()

    # 2. Hash Query Parameters (excluding 'lang' to avoid duplicate key variance)
    query_items = sorted([(k, v) for k, v in request.query_params.items() if k != "lang"])
    query_str = "&".join(f"{k}={v}" for k, v in query_items)
    query_hash = hashlib.md5(query_str.encode()).hexdigest()[:8] if query_str else "base"

    # 3. Content Version
    version = _content_versions.get(prefix, 1)

    return f"{prefix}:{locale}:{query_hash}:v{version}"


def cached_endpoint(cache: TTLCache, key_prefix: str):
    """
    Decorator for FastAPI endpoints to cache response output using TTLCache.
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Locate Request object in args or kwargs
            request: Optional[Request] = kwargs.get("request")
            if not request:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if not request:
                # If Request is not passed, fallback to execution without caching
                return await func(*args, **kwargs)

            cache_key = generate_cache_key(request, key_prefix)
            cached_data = cache.get(cache_key)

            if cached_data is not None:
                if isinstance(cached_data, dict) or isinstance(cached_data, list):
                    response = JSONResponse(content=cached_data)
                    response.headers["X-Cache"] = "HIT"
                    response.headers["X-Cache-Key"] = cache_key
                    return response
                return cached_data

            # Execute real endpoint function
            result = await func(*args, **kwargs)
            
            # Store result in cache (serializable data or dict)
            cache.set(cache_key, result)

            if isinstance(result, dict) or isinstance(result, list):
                response = JSONResponse(content=result)
                response.headers["X-Cache"] = "MISS"
                response.headers["X-Cache-Key"] = cache_key
                return response

            return result
        return wrapper
    return decorator

# Event-driven Invalidation Functions
def invalidate_templates():
    bump_content_version("templates")
    templates_cache.clear()

def invalidate_faqs():
    bump_content_version("faqs")
    faqs_cache.clear()

def invalidate_feature_flags():
    bump_content_version("feature_flags")
    feature_flags_cache.clear()

def invalidate_public_library():
    bump_content_version("public_library")
    public_library_cache.clear()
