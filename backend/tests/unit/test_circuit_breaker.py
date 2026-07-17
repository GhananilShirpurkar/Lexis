import time
import pytest
import asyncio
from app.core.circuit_breaker import CircuitBreaker, CircuitBreakerOpenException

@pytest.mark.asyncio
async def test_circuit_breaker_trips_to_open():
    """
    Verify that 5 consecutive failures cause the circuit breaker to transition to OPEN state.
    """
    breaker = CircuitBreaker(
        name="test_service",
        failure_threshold=5,
        recovery_timeout=30.0,
        rolling_window=60.0,
        call_timeout=1.0,
        max_concurrent=5
    )

    async def failing_func():
        raise ValueError("Simulated network failure")

    # Record 5 failures
    for i in range(5):
        with pytest.raises(ValueError):
            await breaker.call(failing_func)

    assert breaker.state == "OPEN"
    assert breaker.trips_total == 1

    # Next call should fast-fail with CircuitBreakerOpenException without invoking func
    with pytest.raises(CircuitBreakerOpenException) as exc_info:
        await breaker.call(failing_func)
    
    assert "Circuit breaker is OPEN" in str(exc_info.value)


@pytest.mark.asyncio
async def test_circuit_breaker_half_open_recovery():
    """
    Verify transition from OPEN to HALF-OPEN after cool-down, and to CLOSED upon success.
    """
    breaker = CircuitBreaker(
        name="recovery_service",
        failure_threshold=2,
        recovery_timeout=0.2,  # Short recovery for testing
        rolling_window=60.0,
        call_timeout=1.0,
        max_concurrent=5
    )

    async def failing_func():
        raise ValueError("Fail")

    async def succeeding_func():
        return "Success"

    # Trip breaker
    for _ in range(2):
        with pytest.raises(ValueError):
            await breaker.call(failing_func)

    assert breaker.state == "OPEN"

    # Wait for cool-down
    await asyncio.sleep(0.25)

    # Next call should attempt HALF-OPEN probe
    res = await breaker.call(succeeding_func)
    assert res == "Success"
    assert breaker.state == "CLOSED"


@pytest.mark.asyncio
async def test_circuit_breaker_call_timeout():
    """
    Verify that calls exceeding call_timeout raise TimeoutError and count as failures.
    """
    breaker = CircuitBreaker(
        name="timeout_service",
        failure_threshold=2,
        recovery_timeout=30.0,
        rolling_window=60.0,
        call_timeout=0.1,
        max_concurrent=5
    )

    async def slow_func():
        await asyncio.sleep(0.5)

    with pytest.raises(asyncio.TimeoutError):
        await breaker.call(slow_func)

    assert len(breaker.failures) == 1
