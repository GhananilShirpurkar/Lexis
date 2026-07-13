import tempfile
from unittest.mock import patch, MagicMock
from hypothesis import given, settings as h_settings, HealthCheck, strategies as st
import pytest
from app.rag.pipeline import index_document, generate_summary
from app.config import settings

@given(
    content=st.text(alphabet=[" ", "\t", "\n", "\r", "\v", "\f"], min_size=0, max_size=500),
    ext=st.sampled_from([".txt", ".md"]),
    filename_base=st.text(min_size=1, max_size=50).filter(lambda s: "." not in s and "/" not in s and "\x00" not in s),
    user_id=st.integers(min_value=1, max_value=100000),
    doc_id=st.integers(min_value=1, max_value=100000)
)
@h_settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.too_slow])
def test_property_document_parser_empty_states(content, ext, filename_base, user_id, doc_id):
    """
    Property 22: Property test verifying that blank parser extractions
    (i.e., empty or whitespace-only documents) always throw ValueError("EMPTY_DOCUMENT").
    """
    file_bytes = content.encode("utf-8")
    filename = f"{filename_base}{ext}"
    
    with tempfile.TemporaryDirectory() as tmp_dir:
        with patch.object(settings, "STORAGE_INDICES_DIR", tmp_dir):
            with pytest.raises(ValueError, match="EMPTY_DOCUMENT"):
                index_document(file_bytes, filename, user_id, doc_id)


# ---------------------------------------------------------------------------
# Property 13: Document summary stays within length bounds
# Validates: Requirements 2.5, 8.1, 10.2, 10.3
# ---------------------------------------------------------------------------

@given(
    llm_response=st.text(min_size=1, max_size=6000),
    input_text=st.text(min_size=1, max_size=500),
    filename=st.just("test_document.txt"),
)
@h_settings(max_examples=100)
def test_property_summary_within_length_bounds_when_llm_succeeds(
    llm_response, input_text, filename
):
    """
    Property 13 (Part A): When the LLM returns a non-empty response, generate_summary
    must return a string that is at most 5,000 characters and at most 150 words.

    The mock intercepts the Gemini call so no real API key is required.
    """
    mock_gemini_response = MagicMock()
    mock_gemini_response.text = llm_response

    mock_model = MagicMock()
    mock_model.generate_content.return_value = mock_gemini_response

    with patch("app.rag.pipeline.genai.configure"), \
         patch("app.rag.pipeline.genai.GenerativeModel", return_value=mock_model), \
         patch.object(settings, "GEMINI_API_KEY", "mock-key"), \
         patch.object(settings, "GROQ_API_KEY", None):

        result = generate_summary(input_text, filename)

    # The result must be a string
    assert isinstance(result, str), "generate_summary must return a str"

    if result:
        # Character bound
        assert len(result) <= 5000, (
            f"Summary exceeds 5000-character limit: got {len(result)} chars"
        )
        # Word bound — split on whitespace, filter empty tokens
        word_count = len([w for w in result.split() if w])
        assert word_count <= 150, (
            f"Summary exceeds 150-word limit: got {word_count} words"
        )


@given(
    input_text=st.text(min_size=1, max_size=500),
    filename=st.just("test_document.txt"),
)
@h_settings(max_examples=50)
def test_property_summary_empty_string_when_both_providers_fail(input_text, filename):
    """
    Property 13 (Part B): When both Gemini and Groq raise exceptions,
    generate_summary must return an empty string — never raise.
    """
    with patch.object(settings, "GEMINI_API_KEY", "mock-key"), \
         patch.object(settings, "GROQ_API_KEY", "mock-groq-key"), \
         patch("app.rag.pipeline.genai.configure"), \
         patch(
             "app.rag.pipeline.genai.GenerativeModel",
             side_effect=Exception("Gemini connection error"),
         ), \
         patch(
             "app.rag.pipeline.Groq",
             side_effect=Exception("Groq connection error"),
         ):

        result = generate_summary(input_text, filename)

    assert result == "", (
        f"Expected empty string on total provider failure, got: {result!r}"
    )


@given(
    input_text=st.text(min_size=1, max_size=500),
    filename=st.just("test_document.txt"),
)
@h_settings(max_examples=50)
def test_property_summary_empty_string_when_no_api_keys(input_text, filename):
    """
    Property 13 (Part C): When no API keys are configured,
    generate_summary must return an empty string without raising.
    """
    with patch.object(settings, "GEMINI_API_KEY", None), \
         patch.object(settings, "GROQ_API_KEY", None):

        result = generate_summary(input_text, filename)

    assert result == "", (
        f"Expected empty string with no API keys configured, got: {result!r}"
    )
