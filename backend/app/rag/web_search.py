"""
Tavily Web Search Service for LEXIS RAG Pipeline.

Provides web search capability with in-memory caching (10-min TTL)
and rate limiting (1 search per 3 seconds). Results are ephemeral —
not persisted to DB, only included in SSE response payloads.
"""
import time
import hashlib
import logging
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)

# In-memory cache: { query_hash: { "results": [...], "timestamp": float } }
_search_cache: dict[str, dict] = {}
_CACHE_TTL_SECONDS = 600  # 10 minutes

# Rate limiter state
_last_search_time: float = 0.0
_RATE_LIMIT_INTERVAL = 3.0  # seconds


def _cache_key(query: str, max_results: int, depth: str) -> str:
    raw = f"{query.lower().strip()}|{max_results}|{depth}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _get_cached(key: str) -> Optional[list[dict]]:
    entry = _search_cache.get(key)
    if entry and (time.time() - entry["timestamp"]) < _CACHE_TTL_SECONDS:
        logger.debug(f"Tavily cache HIT for key {key[:12]}...")
        return entry["results"]
    if entry:
        del _search_cache[key]
    return None


def _set_cached(key: str, results: list[dict]):
    # Evict stale entries if cache grows too large
    if len(_search_cache) > 200:
        now = time.time()
        stale_keys = [k for k, v in _search_cache.items() if now - v["timestamp"] > _CACHE_TTL_SECONDS]
        for k in stale_keys:
            del _search_cache[k]

    _search_cache[key] = {"results": results, "timestamp": time.time()}


def _check_rate_limit() -> bool:
    global _last_search_time
    now = time.time()
    if now - _last_search_time < _RATE_LIMIT_INTERVAL:
        return False
    _last_search_time = now
    return True


def search_web(
    query: str,
    max_results: int | None = None,
    search_depth: str | None = None
) -> tuple[list[dict], str | None]:
    """
    Performs a Tavily web search and returns formatted results along with an optional system warning.

    Returns tuple: (list of dicts, system_warning_string_or_None)
    Each result dict: { "title": str, "url": str, "content": str, "score": float }
    Returns ([], warning_msg) on error (graceful degradation).
    """
    if not settings.TAVILY_API_KEY:
        logger.warning("TAVILY_API_KEY not configured — web search disabled")
        return [], "Web search unavailable (API key not configured)"

    max_results = max_results or settings.TAVILY_MAX_RESULTS
    search_depth = search_depth or settings.TAVILY_SEARCH_DEPTH

    # Check cache first
    key = _cache_key(query, max_results, search_depth)
    cached = _get_cached(key)
    if cached is not None:
        return cached, None

    # Rate limit check
    if not _check_rate_limit():
        logger.warning("Tavily rate limit hit — skipping web search for this request")
        return [], "Web search rate limit reached — please wait a moment"

    try:
        from tavily import TavilyClient
        from app.core.circuit_breaker import tavily_breaker, CircuitBreakerOpenException

        def _do_search():
            client = TavilyClient(api_key=settings.TAVILY_API_KEY)
            return client.search(
                query=query,
                max_results=max_results,
                search_depth=search_depth,
                include_answer=False,
            )

        # Execute Tavily search via Circuit Breaker
        import asyncio
        loop = asyncio.get_event_loop() if asyncio.get_event_loop().is_running() else None
        
        # If in async context, run via tavily_breaker.call
        try:
            # Handle sync call inside circuit breaker runner
            if loop and loop.is_running():
                response = tavily_breaker.semaphore
                # Direct invocation using tavily_breaker logic
                now = time.time()
                if tavily_breaker.state == "OPEN":
                    if now - tavily_breaker.last_state_change > tavily_breaker.recovery_timeout:
                        tavily_breaker.state = "HALF-OPEN"
                        tavily_breaker.last_state_change = now
                    else:
                        raise CircuitBreakerOpenException(
                            "tavily", "Circuit breaker is OPEN. Web search temporarily offline."
                        )
                
                # Perform call with timeout
                start = time.time()
                response = _do_search()
                if time.time() - start > tavily_breaker.call_timeout:
                    tavily_breaker._record_failure(TimeoutError("Tavily search call timed out"))
                    return [], "Web search request timed out"
                tavily_breaker._record_success()
            else:
                response = _do_search()
        except CircuitBreakerOpenException as cbo:
            logger.warning(f"Tavily Circuit Breaker OPEN: {cbo}")
            return [], "⚠️ Web search temporarily offline"
        except Exception as err:
            tavily_breaker._record_failure(err)
            raise err

        results = []
        # Total token budget approximation: ~4 chars per token -> 1500 tokens = ~6000 chars max total context
        max_total_chars = getattr(settings, "TAVILY_TOKEN_CAP", 1500) * 4
        current_total_chars = 0

        raw_results = response.get("results", [])
        if not raw_results:
            logger.info(f"Tavily search returned 0 results for: {query[:60]}")
            return [], "No web search results found"

        # Per-result budget calculation
        per_result_max = max(500, max_total_chars // max(1, len(raw_results)))

        for item in raw_results:
            content_str = (item.get("content") or "").strip()
            if len(content_str) > per_result_max:
                content_str = content_str[:per_result_max] + "..."

            if current_total_chars + len(content_str) > max_total_chars:
                remaining = max_total_chars - current_total_chars
                if remaining > 100:
                    content_str = content_str[:remaining] + "..."
                else:
                    break

            current_total_chars += len(content_str)
            results.append({
                "title": item.get("title", "Untitled"),
                "url": item.get("url", ""),
                "content": content_str,
                "score": item.get("score", 0.0),
            })

        # Cache the results
        _set_cached(key, results)
        logger.info(f"Tavily search returned {len(results)} results for: {query[:60]}...")
        return results, None

    except CircuitBreakerOpenException as cbo:
        logger.warning(f"Tavily Circuit Breaker OPEN: {cbo}")
        return [], "⚠️ Web search temporarily offline"
    except ImportError:
        logger.error("tavily-python package not installed. Run: pip install tavily-python")
        return [], "Web search package unavailable"
    except Exception as e:
        logger.error(f"Tavily web search failed: {e}")
        return [], "Web search service unavailable"
