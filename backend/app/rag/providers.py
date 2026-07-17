import asyncio
import logging
from typing import AsyncGenerator
from google import genai
from groq import AsyncGroq
from app.config import settings

logger = logging.getLogger(__name__)

class LLMUnavailableError(Exception):
    """Exception raised when all retry attempts to contact LLM provider fail."""
    pass

async def _with_retry(fn, max_attempts: int = 2):
    delay = 0.5
    for attempt in range(1, max_attempts + 1):
        try:
            return await fn()
        except Exception as e:
            err_str = str(e).lower()
            # Immediately abort retries on auth (401/403) or resource missing (404)
            if any(term in err_str for term in ["401", "403", "404", "invalid_api_key", "not found", "unauthorized"]):
                raise LLMUnavailableError(f"LLM API Configuration Error: {e}")
            
            if attempt == max_attempts:
                raise LLMUnavailableError(f"LLM provider unavailable after {max_attempts} attempts: {e}")
            logger.warning(f"LLM call failed (attempt {attempt}/{max_attempts}). Retrying in {delay}s... Error: {e}")
            await asyncio.sleep(delay)
            delay = min(delay * 2, 4.0)

async def stream_mock(prompt: str) -> AsyncGenerator[str, None]:
    """
    Generates a simulated RAG stream response based on the prompt context
    for offline testing and development.
    """
    import re
    # Extract query
    query_match = re.search(r"User Query:\s*(.*)", prompt, re.IGNORECASE)
    user_query = query_match.group(1).strip() if query_match else ""

    # Extract chunks: "--- Chunk {i+1} (Source: {file_name}, Page: {page_num}) ---\n{text}\n\n"
    chunks = re.findall(r"--- Chunk \d+ \(Source: (.*?), Page: (.*?)\) ---\n(.*?)(?=\n\n--- Chunk \d+|\Z)", prompt, re.DOTALL)
    
    if chunks:
        source, page, full_text = chunks[0]
        cleaned_context = " ".join(full_text.strip().split())

        # If user asks specific term or question, attempt to highlight/summarize relevant text
        query_words = [w.lower() for w in user_query.split() if len(w) > 3 and w.lower() not in ["what", "does", "have", "with", "this", "that", "from", "contain", "show"]]
        
        relevant_sentences = []
        sentences = [s.strip() for s in cleaned_context.split('.') if s.strip()]
        for s in sentences:
            if any(qw in s.lower() for qw in query_words):
                relevant_sentences.append(s)

        if relevant_sentences:
            extracted_answer = ". ".join(relevant_sentences[:2]) + "."
            response_text = f"Based on **{source}** [page {page}], {extracted_answer}"
        else:
            excerpt = " ".join(cleaned_context.split()[:40]) + "..."
            response_text = f"According to **{source}** [page {page}], the document states: \"{excerpt}\""
    else:
        response_text = "No relevant context chunks were found in the uploaded document."

    # Stream word by word with a typing delay
    for word in response_text.split(" "):
        if word:
            yield word + " "
            await asyncio.sleep(0.02)

async def stream_gemini(prompt: str) -> AsyncGenerator[str, None]:
    """
    Streams response from official Gemini models using modern google.genai SDK
    protected by llm_breaker circuit breaker.
    """
    from app.core.circuit_breaker import llm_breaker, CircuitBreakerOpenException

    if settings.FORCE_MOCK_LLM or not settings.GEMINI_API_KEY:
        async for chunk in stream_mock(prompt):
            yield chunk
        return

    import time
    now = time.time()
    if llm_breaker.state == "OPEN":
        if now - llm_breaker.last_state_change > llm_breaker.recovery_timeout:
            llm_breaker.state = "HALF-OPEN"
            llm_breaker.last_state_change = now
        else:
            raise CircuitBreakerOpenException(
                "llm_provider",
                "AI service temporarily unavailable. Please try again shortly."
            )

    async with llm_breaker.semaphore:
        try:
            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            models_to_try = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"]
            
            for model_name in models_to_try:
                try:
                    response = client.models.generate_content_stream(
                        model=model_name,
                        contents=prompt,
                    )
                    has_yielded = False
                    for chunk in response:
                        if chunk.text:
                            has_yielded = True
                            yield chunk.text
                    if has_yielded:
                        llm_breaker._record_success()
                        return
                except Exception as model_err:
                    logger.warning(f"google.genai model {model_name} failed: {model_err}")
                    continue
            llm_breaker._record_failure(Exception("All Gemini models failed"))
        except CircuitBreakerOpenException as cbo:
            raise cbo
        except Exception as e:
            llm_breaker._record_failure(e)
            logger.error(f"Google GenAI API streaming failed: {e}")

    # Fallback to mock if all official calls fail
    async for chunk in stream_mock(prompt):
        yield chunk

async def stream_groq(prompt: str) -> AsyncGenerator[str, None]:
    """
    Streams response from Groq official model protected by llm_breaker circuit breaker.
    """
    from app.core.circuit_breaker import llm_breaker, CircuitBreakerOpenException

    if settings.FORCE_MOCK_LLM or not settings.GROQ_API_KEY:
        async for chunk in stream_mock(prompt):
            yield chunk
        return

    import time
    now = time.time()
    if llm_breaker.state == "OPEN":
        if now - llm_breaker.last_state_change > llm_breaker.recovery_timeout:
            llm_breaker.state = "HALF-OPEN"
            llm_breaker.last_state_change = now
        else:
            raise CircuitBreakerOpenException(
                "llm_provider",
                "AI service temporarily unavailable. Please try again shortly."
            )

    async with llm_breaker.semaphore:
        try:
            client = AsyncGroq(api_key=settings.GROQ_API_KEY)
            for model_name in ["llama-3.3-70b-versatile", "llama3-8b-8192", "mixtral-8x7b-32768"]:
                try:
                    response = await client.chat.completions.create(
                        messages=[{"role": "user", "content": prompt}],
                        model=model_name,
                        stream=True,
                    )
                    has_yielded = False
                    async for chunk in response:
                        if chunk.choices and chunk.choices[0].delta.content:
                            has_yielded = True
                            yield chunk.choices[0].delta.content
                    if has_yielded:
                        llm_breaker._record_success()
                        return
                except Exception as groq_m_err:
                    logger.warning(f"Groq model {model_name} failed: {groq_m_err}")
                    continue
            llm_breaker._record_failure(Exception("All Groq models failed"))
        except CircuitBreakerOpenException as cbo:
            raise cbo
        except Exception as e:
            llm_breaker._record_failure(e)
            logger.error(f"Groq API streaming failed: {e}")

    async for chunk in stream_mock(prompt):
        yield chunk
