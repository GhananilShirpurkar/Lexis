import time
from abc import ABC, abstractmethod
from collections import deque
from fastapi import Request, HTTPException, status
from app.config import settings
from app.schemas.user import UserCreate

class RateLimitStorage(ABC):
    @abstractmethod
    def check_and_add(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        """Checks if the key exceeds the limit within the window.
        If allowed, records the current attempt timestamp.
        Returns:
            (allowed: bool, retry_after_seconds: int)
        """
        pass

    @abstractmethod
    def clear(self, key: str) -> None:
        """Clear attempt history for the given key."""
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

    def clear(self, key: str) -> None:
        """Clear attempt history for the given key."""
        if key in self._storage:
            del self._storage[key]

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

async def check_login_rate_limit(request: Request, user_in: UserCreate) -> None:
    """FastAPI dependency to enforce independent IP and email sliding-window rate limits on login."""
    ip = get_client_ip(request)
    email = user_in.email
    
    # 1. Enforce IP-based limit
    ip_key = f"ip:{ip}"
    allowed_ip, retry_ip = limiter_storage.check_and_add(
        ip_key, 
        settings.RATE_LIMIT_LOGIN_IP_LIMIT, 
        settings.RATE_LIMIT_LOGIN_IP_WINDOW
    )
    if not allowed_ip:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_ip)},
            detail={
                "error": {
                    "code": "RATE_LIMITED",
                    "message": f"Too many requests from this IP. Please try again in {retry_ip} seconds.",
                    "retry_after": retry_ip
                }
            }
        )
        
    # 2. Enforce Email-based limit
    email_key = f"email:{email}"
    allowed_email, retry_email = limiter_storage.check_and_add(
        email_key, 
        settings.RATE_LIMIT_LOGIN_EMAIL_LIMIT, 
        settings.RATE_LIMIT_LOGIN_EMAIL_WINDOW
    )
    if not allowed_email:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_email)},
            detail={
                "error": {
                    "code": "RATE_LIMITED",
                    "message": f"Too many login attempts for this email. Please try again in {retry_email} seconds.",
                    "retry_after": retry_email
                }
            }
        )
