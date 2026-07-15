import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from hypothesis import given, strategies as st, settings as h_settings
from app.rag.providers import _with_retry, LLMUnavailableError, stream_gemini, stream_groq
from app.config import settings

# ---------------------------------------------------------------------------
# Property/Unit Tests: retry and exponential backoff behavior
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_with_retry_success_first_attempt():
    """Verify _with_retry succeeds immediately if the function succeeds."""
    mock_fn = AsyncMock(return_value="success_result")
    
    with patch("asyncio.sleep") as mock_sleep:
        result = await _with_retry(mock_fn)
        assert result == "success_result"
        assert mock_fn.call_count == 1
        mock_sleep.assert_not_called()


@pytest.mark.asyncio
async def test_with_retry_success_on_third_attempt():
    """Verify _with_retry retries on failure and succeeds when call succeeds later."""
    attempts = 0
    async def failing_then_succeeding_fn():
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise ValueError("Temporary failure")
        return "success"

    with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await _with_retry(failing_then_succeeding_fn)
        assert result == "success"
        assert attempts == 3
        # Sleep calls: 1.0s and 2.0s
        assert mock_sleep.call_count == 2
        mock_sleep.assert_any_call(1.0)
        mock_sleep.assert_any_call(2.0)


@pytest.mark.asyncio
async def test_with_retry_exhausted_raises_llm_unavailable():
    """Verify _with_retry raises LLMUnavailableError after max attempts (4)."""
    mock_fn = AsyncMock(side_effect=ValueError("Persistent failure"))
    
    with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        with pytest.raises(LLMUnavailableError, match="LLM provider unavailable after 4 attempts"):
            await _with_retry(mock_fn, max_attempts=4)
            
        assert mock_fn.call_count == 4
        assert mock_sleep.call_count == 3
        mock_sleep.assert_any_call(1.0)
        mock_sleep.assert_any_call(2.0)
        mock_sleep.assert_any_call(4.0)


# ---------------------------------------------------------------------------
# Unit tests: API key missing conditions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stream_gemini_missing_key():
    """Verify stream_gemini raises LLMUnavailableError when GEMINI_API_KEY is not configured."""
    with patch.object(settings, "GEMINI_API_KEY", ""):
        with pytest.raises(LLMUnavailableError, match="Gemini API key not configured"):
            async for _ in stream_gemini("test prompt"):
                pass


@pytest.mark.asyncio
async def test_stream_groq_missing_key():
    """Verify stream_groq raises LLMUnavailableError when GROQ_API_KEY is not configured."""
    with patch.object(settings, "GROQ_API_KEY", None):
        with pytest.raises(LLMUnavailableError, match="Groq API key not configured"):
            async for _ in stream_groq("test prompt"):
                pass
