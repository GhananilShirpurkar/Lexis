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


# ---------------------------------------------------------------------------
# Property 12: chunk retrieval count limits
# ---------------------------------------------------------------------------

@given(
    num_chunks=st.integers(min_value=0, max_value=10)
)
@h_settings(max_examples=50)
def test_property_retrieval_chunk_limit(num_chunks):
    """
    Property 12: Mock retriever returning `num_chunks` chunks.
    Verify that:
    1. If zero chunks: triggers `NO_CONTENT_RETRIEVED` without calling LLM.
    2. If > 0 chunks: pipeline passes at most 5 chunks to build_prompt and the LLM.
    """
    import asyncio
    import json
    import uuid
    from llama_index.core.schema import NodeWithScore, TextNode
    from app.rag.pipeline import query
    from app.models.chat import Chat

    # Setup mock nodes
    mock_nodes = [
        NodeWithScore(
            node=TextNode(text=f"Chunk content {i}", metadata={"file_name": "doc.pdf"}),
            score=0.8
        )
        for i in range(num_chunks)
    ]

    # Mock DB, Chat, retrieve_context, and stream_gemini
    mock_db = MagicMock()
    # Mock AsyncSession's execute
    mock_execute_result = MagicMock()
    mock_chat = Chat(
        id=uuid.uuid4(),
        user_id=123,
        current_doc_id=uuid.uuid4(),
        last_provider="gemini"
    )
    mock_execute_result.scalars().first.return_value = mock_chat
    
    # We need an async execute
    async def async_execute(*args, **kwargs):
        return mock_execute_result
    mock_db.execute = async_execute

    # Keep track of build_prompt arguments
    prompt_nodes_passed = []
    def spy_build_prompt(query_text, nodes):
        prompt_nodes_passed.extend(nodes)
        return "mock prompt"

    async def mock_stream(prompt):
        yield "response token"

    # Mock retrieve_context to mimic actual retrieval where similarity_top_k=5
    # So the retriever will return at most 5 nodes.
    retrieved_nodes = mock_nodes[:5]

    if num_chunks == 0:
        # Zero chunks triggers ValueError("NO_CONTENT_RETRIEVED")
        def mock_retrieve_context_empty(user_id, doc_id, query_str, top_k=5):
            raise ValueError("NO_CONTENT_RETRIEVED")
        
        with patch("app.rag.pipeline.retrieve_context", side_effect=mock_retrieve_context_empty), \
             patch("app.rag.providers.stream_gemini", side_effect=mock_stream) as mock_llm_call:
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            async def run_query():
                events = []
                async for event in query(chat_id=mock_chat.id, user_message="hello", provider="gemini", db=mock_db):
                    events.append(event)
                return events

            events = loop.run_until_complete(run_query())
            loop.close()

            assert len(events) == 1
            data = json.loads(events[0].replace("data: ", "").strip())
            assert data["type"] == "error"
            assert data["code"] == "NO_CONTENT_RETRIEVED"
            mock_llm_call.assert_not_called()
    else:
        # > 0 chunks
        def mock_retrieve_context_nodes(user_id, doc_id, query_str, top_k=5):
            return retrieved_nodes

        with patch("app.rag.pipeline.retrieve_context", side_effect=mock_retrieve_context_nodes), \
             patch("app.rag.pipeline.build_prompt", side_effect=spy_build_prompt), \
             patch("app.rag.providers.stream_gemini", side_effect=mock_stream) as mock_llm_call:
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            async def run_query():
                events = []
                async for event in query(chat_id=mock_chat.id, user_message="hello", provider="gemini", db=mock_db):
                    events.append(event)
                return events

            events = loop.run_until_complete(run_query())
            loop.close()

            assert len(events) > 0
            # Ensure at most 5 nodes were passed to build_prompt
            assert len(prompt_nodes_passed) <= 5
            assert len(prompt_nodes_passed) == min(num_chunks, 5)
            mock_llm_call.assert_called_once()

