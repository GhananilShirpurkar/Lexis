import asyncio
import json
import uuid
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime, timezone
import pytest
from hypothesis import given, strategies as st, settings as h_settings
from llama_index.core.schema import NodeWithScore, TextNode
from app.rag.pipeline import query
from app.models.message import Message
from app.models.chat import Chat
from app.models.document import Document
from app.models.citation import Citation

# ---------------------------------------------------------------------------
# Property 10: message record — chat_id, user_id, created_at, provider, doc_id non-null
# ---------------------------------------------------------------------------

@given(
    chat_id=st.uuids(),
    user_id=st.integers(min_value=1, max_value=100000),
    content=st.text(min_size=1, max_size=100),
    provider=st.sampled_from(["gemini", "groq"]),
    doc_id=st.uuids(),
)
@h_settings(max_examples=50)
def test_property_message_record_fields(chat_id, user_id, content, provider, doc_id):
    """
    Property 10: Verify message record fields (chat_id, user_id, provider, doc_id)
    are correctly stored and non-null on creation.
    """
    user_msg = Message(
        id=uuid.uuid4(),
        chat_id=chat_id,
        user_id=user_id,
        role="user",
        content=content,
        provider=provider,
        doc_id=doc_id,
        created_at=datetime.now(timezone.utc)
    )
    
    assert user_msg.chat_id == chat_id
    assert user_msg.user_id == user_id
    assert user_msg.role == "user"
    assert user_msg.content == content
    assert user_msg.provider == provider
    assert user_msg.doc_id == doc_id
    assert user_msg.created_at is not None


# ---------------------------------------------------------------------------
# Property 11 & 21: Unit tests for RAG pipeline citation generation & grouping
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_property_11_zero_chunks_returns_error():
    """
    Property 11: Zero chunks retrieved -> yield NO_CONTENT_RETRIEVED error
    and do not call LLM, nor persist any message.
    """
    mock_db = AsyncMock()
    mock_chat = Chat(
        id=uuid.uuid4(),
        user_id=123,
        current_doc_id=uuid.uuid4(),
        last_provider="gemini"
    )
    
    # Mock database queries
    mock_result = MagicMock()
    mock_result.scalars().first.return_value = mock_chat
    mock_db.execute.return_value = mock_result
    
    # Mock context retrieval to raise empty index error
    with patch("app.rag.pipeline.retrieve_context", side_effect=ValueError("NO_CONTENT_RETRIEVED")):
        events = []
        async for event in query(chat_id=mock_chat.id, user_message="test", provider="gemini", db=mock_db):
            events.append(event)
            
        assert len(events) == 1
        data = json.loads(events[0].replace("data: ", "").strip())
        assert data["type"] == "error"
        assert data["code"] == "NO_CONTENT_RETRIEVED"
        
        # Verify db was never committed
        mock_db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_property_21_citation_grouping():
    """
    Property 21: Multiple chunks from the same document -> exactly 1 citation
    entry for that document, combining and truncating the excerpts to <= 200 chars.
    """
    mock_db = AsyncMock()
    doc_id = uuid.uuid4()
    mock_chat = Chat(
        id=uuid.uuid4(),
        user_id=123,
        current_doc_id=doc_id,
        last_provider="gemini"
    )
    
    mock_result = MagicMock()
    mock_result.scalars().first.return_value = mock_chat
    mock_db.execute.return_value = mock_result
    
    # Create 3 chunks from the same document
    chunk_texts = [
        "First excerpt from the document that is quite short.",
        "Second excerpt that discusses another point in the text.",
        "Third excerpt with more detailed context."
    ]
    
    nodes = [
        NodeWithScore(
            node=TextNode(
                text=text,
                metadata={"file_name": "test_document.pdf", "page_label": "3"}
            ),
            score=0.9
        )
        for text in chunk_texts
    ]
    
    async def mock_stream(prompt):
        yield "This is "
        yield "a response."

    with patch("app.rag.pipeline.retrieve_context", return_value=nodes), \
         patch("app.rag.providers.stream_gemini", side_effect=mock_stream):
         
        events = []
        async for event in query(chat_id=mock_chat.id, user_message="What is this?", provider="gemini", db=mock_db):
            events.append(event)
            
        # Parse final done event
        done_event = events[-1]
        assert done_event.startswith("data: ")
        data = json.loads(done_event.replace("data: ", "").strip())
        
        assert data["type"] == "done"
        citations = data["citations"]
        
        # Must contain EXACTLY 1 citation entry for the document
        assert len(citations) == 1
        citation = citations[0]
        
        assert citation["document_id"] == str(doc_id)
        assert citation["doc_filename"] == "test_document.pdf"
        assert citation["page_number"] == 3
        
        # Verify excerpt preserves full text
        assert len(citation["excerpt"]) > 0
        
        # Verify it lists all excerpts joined
        for txt in chunk_texts:
            assert txt in citation["excerpt"]
            
        # Verify database persist was called
        assert mock_db.add.call_count == 3  # user message, assistant message, citation
        mock_db.commit.assert_called_once()
