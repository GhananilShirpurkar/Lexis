import time
import logging
import asyncio
from collections import deque
from typing import Callable, Any, Dict

logger = logging.getLogger(__name__)

class CircuitBreakerOpenException(Exception):
    """Exception raised when a call is blocked due to an OPEN circuit breaker."""
    def __init__(self, name: str, message: str = "Circuit breaker is OPEN"):
        self.name = name
        self.message = message
        super().__init__(f"[{name}] {message}")

class CircuitBreaker:
    """
    Async Circuit Breaker pattern with rolling window failure tracking,
    concurrency limit semaphores, per-call timeouts, and HALF-OPEN recovery.
    """
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        rolling_window: float = 60.0,
        call_timeout: float = 5.0,
        max_concurrent: int = 10
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.rolling_window = rolling_window
        self.call_timeout = call_timeout
        self.max_concurrent = max_concurrent
        
        self.state = "CLOSED"  # CLOSED, OPEN, HALF-OPEN
        self.failures = deque()
        self.last_state_change = time.time()
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.trips_total = 0

    def _clean_old_failures(self, now: float) -> None:
        while self.failures and now - self.failures[0] > self.rolling_window:
            self.failures.popleft()

    def _record_success(self) -> None:
        if self.state == "HALF-OPEN":
            logger.info(f"CircuitBreaker[{self.name}]: HALF-OPEN probe succeeded. Resetting state to CLOSED.")
            self.state = "CLOSED"
            self.failures.clear()
            self.last_state_change = time.time()

    def _record_failure(self, error: Exception) -> None:
        now = time.time()
        self._clean_old_failures(now)
        self.failures.append(now)
        logger.warning(f"CircuitBreaker[{self.name}]: Recorded failure #{len(self.failures)}: {error}")

        if self.state == "HALF-OPEN" or len(self.failures) >= self.failure_threshold:
            if self.state != "OPEN":
                self.state = "OPEN"
                self.trips_total += 1
                self.last_state_change = now
                logger.error(
                    f"CircuitBreaker[{self.name}]: Failure threshold breached ({len(self.failures)} failures). State changed to OPEN."
                )

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        now = time.time()

        # Check circuit state
        if self.state == "OPEN":
            if now - self.last_state_change > self.recovery_timeout:
                self.state = "HALF-OPEN"
                self.last_state_change = now
                logger.info(f"CircuitBreaker[{self.name}]: Recovery cool-down elapsed. Transitioning to HALF-OPEN.")
            else:
                retry_in = int(self.recovery_timeout - (now - self.last_state_change))
                raise CircuitBreakerOpenException(
                    self.name,
                    f"Circuit breaker is OPEN. Dependency temporarily offline (retry after {retry_in}s)."
                )

        async with self.semaphore:
            try:
                if asyncio.iscoroutinefunction(func):
                    result = await asyncio.wait_for(func(*args, **kwargs), timeout=self.call_timeout)
                else:
                    loop = asyncio.get_running_loop()
                    result = await asyncio.wait_for(
                        loop.run_in_executor(None, lambda: func(*args, **kwargs)),
                        timeout=self.call_timeout
                    )
                self._record_success()
                return result
            except Exception as e:
                self._record_failure(e)
                raise

    def get_status(self) -> Dict[str, Any]:
        now = time.time()
        self._clean_old_failures(now)
        return {
            "name": self.name,
            "state": self.state,
            "failure_count": len(self.failures),
            "trips_total": self.trips_total,
            "max_concurrent": self.max_concurrent,
            "call_timeout": self.call_timeout
        }


# Dependency Circuit Breakers
tavily_breaker = CircuitBreaker(
    name="tavily",
    failure_threshold=5,
    recovery_timeout=30.0,
    rolling_window=60.0,
    call_timeout=5.0,
    max_concurrent=10
)

llm_breaker = CircuitBreaker(
    name="llm_provider",
    failure_threshold=5,
    recovery_timeout=30.0,
    rolling_window=60.0,
    call_timeout=30.0,
    max_concurrent=20
)

storage_breaker = CircuitBreaker(
    name="tigris_storage",
    failure_threshold=5,
    recovery_timeout=30.0,
    rolling_window=60.0,
    call_timeout=10.0,
    max_concurrent=15
)
