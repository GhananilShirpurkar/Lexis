import time
from abc import ABC, abstractmethod
from collections import deque
from fastapi import Request

class RateLimitStorage(ABC):
    @abstractmethod
    def check_and_add(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        """Checks if the key exceeds the limit within the window.
        If allowed, records the current attempt timestamp.
        Returns:
            (allowed: bool, retry_after_seconds: int)
        """
        pass

class InMemoryRateLimitStorage(RateLimitStorage):
    """In-memory sliding window rate limiter storage using deques.
    Suitable for local development and single-process showcase deployments.
    """
    def __init__(self):
        # Maps key -> deque of timestamps
        self._storage: dict[str, deque[float]] = {}

    def check_and_add(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.time()
        if key not in self._storage:
            self._storage[key] = deque()
            
        history = self._storage[key]
        
        # Clean up expired timestamps
        cutoff = now - window_seconds
        while history and history[0] < cutoff:
            history.popleft()
            
        if len(history) >= limit:
            retry_after = int(history[0] + window_seconds - now)
            return False, max(1, retry_after)
            
        history.append(now)
        return True, 0

    def reset(self):
        """Helper to clear rate limit cache, primarily for testing purposes."""
        self._storage.clear()

# Global storage instance
limiter_storage = InMemoryRateLimitStorage()

def get_client_ip(request: Request) -> str:
    """Extract client IP address, checking standard proxy headers for production safety."""
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    
    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        return x_real_ip.strip()
        
    return request.client.host if request.client else "127.0.0.1"
