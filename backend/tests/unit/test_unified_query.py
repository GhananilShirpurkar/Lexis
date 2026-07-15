import asyncio
import json
import uuid
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime, timezone, timedelta
import pytest
from llama_index.core.schema import NodeWithScore, TextNode
from app.rag.pipeline import query_unified
from app.models.project import Project, ProjectChat
from app.models.chat import Chat
from app.models.document import Document
from app.models.message import Message
from app.models.citation import Citation

@pytest.mark.asyncio
async def test_query_unified_success():
    """
    Verify that query_unified correctly queries multiple document indices,
    deduplicates and merges nodes, streams response tokens, and commits.
    """
    mock_db = AsyncMock()
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    unified_chat_id = uuid.uuid4()

    # Create mock Project
    mock_project = Project(
        id=project_id,
        user_id=user_id,
        name="Test Project"
    )

    # Create mock Unified Chat
    mock_unified_chat = Chat(
        id=unified_chat_id,
        user_id=user_id,
        project_id=project_id,
        is_unified=True,
        last_provider="gemini"
    )

    # Create member Chats
    chat1_id = uuid.uuid4()
    chat2_id = uuid.uuid4()
    doc1_id = uuid.uuid4()
    doc2_id = uuid.uuid4()

    mock_chat1 = Chat(
        id=chat1_id,
        user_id=user_id,
        project_id=project_id,
        is_unified=False,
        current_doc_id=doc1_id
    )
    mock_chat2 = Chat(
        id=chat2_id,
        user_id=user_id,
        project_id=project_id,
        is_unified=False,
        current_doc_id=doc2_id
    )

    # Create mock Documents (both active and unexpired)
    mock_doc1 = Document(
        id=doc1_id,
        user_id=user_id,
        filename="doc1.pdf",
        status="active",
        expiry_at=datetime.now(timezone.utc) + timedelta(days=1),
        size_bytes=1000,
        r2_key="key1"
    )
    mock_doc2 = Document(
        id=doc2_id,
        user_id=user_id,
        filename="doc2.pdf",
        status="active",
        expiry_at=datetime.now(timezone.utc) + timedelta(days=1),
        size_bytes=2000,
        r2_key="key2"
    )

    # Setup database execute mock behavior
    # Execution 1: Project
    # Execution 2: Unified Chat
    # Execution 3: Member Chats
    # Execution 4: Documents
    
    project_result = MagicMock()
    project_result.scalars().first.return_value = mock_project

    unified_chat_result = MagicMock()
    unified_chat_result.scalars().first.return_value = mock_unified_chat

    chats_result = MagicMock()
    chats_result.scalars().all.return_value = [mock_chat1, mock_chat2]

    docs_result = MagicMock()
    docs_result.scalars().all.return_value = [mock_doc1, mock_doc2]

    mock_db.execute.side_effect = [
        project_result,
        unified_chat_result,
        chats_result,
        docs_result
    ]

    # Mock context retrieval nodes
    node1 = NodeWithScore(
        node=TextNode(text="This is text from doc1", metadata={"page_label": "1"}),
        score=0.95
    )
    node2 = NodeWithScore(
        node=TextNode(text="This is text from doc2", metadata={"page_label": "2"}),
        score=0.90
    )
    node3 = NodeWithScore(
        node=TextNode(text="Duplicate text content", metadata={"page_label": "3"}),
        score=0.85
    )
    node4 = NodeWithScore(
        node=TextNode(text="Duplicate text content", metadata={"page_label": "1"}),
        score=0.80
    )

    # Mock retrieve_context to return nodes for doc1 and doc2
    def mock_retrieve_context(user_id, doc_id, query_str, top_k=5):
        if doc_id == doc1_id:
            return [node1, node3]
        elif doc_id == doc2_id:
            return [node2, node4]
        return []

    async def mock_stream(prompt):
        yield "Streaming "
        yield "response "
        yield "tokens."

    with patch("app.rag.pipeline.retrieve_context", side_effect=mock_retrieve_context), \
         patch("app.rag.providers.stream_gemini", side_effect=mock_stream):

        events = []
        async for event in query_unified(
            project_id=project_id,
            user_message="test query",
            provider="gemini",
            db=mock_db
        ):
            events.append(event)

        # 4 events expected: 3 token events, 1 done event
        assert len(events) == 4
        
        token_events = [json.loads(e.replace("data: ", "").strip()) for e in events[:-1]]
        for te in token_events:
            assert te["type"] == "token"
            assert "content" in te

        done_event_data = json.loads(events[-1].replace("data: ", "").strip())
        assert done_event_data["type"] == "done"
        
        citations = done_event_data["citations"]
        # Deduplication of duplicate text content should keep node3 (score 0.85) over node4 (score 0.80)
        # So we expect 3 distinct citations (doc1: node1 and node3, doc2: node2)
        assert len(citations) == 2  # one per document
        
        doc_ids_in_citations = {c["document_id"] for c in citations}
        assert str(doc1_id) in doc_ids_in_citations
        assert str(doc2_id) in doc_ids_in_citations

        # Verify DB transactions
        # Adds user message, assistant message, and 2 citations = 4 db.add calls
        assert mock_db.add.call_count == 4
        mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_query_unified_no_content():
    """
    Verify that query_unified yields NO_CONTENT_RETRIEVED error if zero chunks retrieved.
    """
    mock_db = AsyncMock()
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    unified_chat_id = uuid.uuid4()

    mock_project = Project(id=project_id, user_id=user_id, name="Test Project")
    mock_unified_chat = Chat(id=unified_chat_id, user_id=user_id, project_id=project_id, is_unified=True)
    mock_chat1 = Chat(id=uuid.uuid4(), user_id=user_id, project_id=project_id, is_unified=False, current_doc_id=uuid.uuid4())

    project_result = MagicMock()
    project_result.scalars().first.return_value = mock_project
    unified_chat_result = MagicMock()
    unified_chat_result.scalars().first.return_value = mock_unified_chat
    chats_result = MagicMock()
    chats_result.scalars().all.return_value = [mock_chat1]
    
    mock_doc1 = Document(
        id=mock_chat1.current_doc_id,
        user_id=user_id,
        filename="doc1.pdf",
        status="active",
        expiry_at=datetime.now(timezone.utc) + timedelta(days=1),
        size_bytes=1000,
        r2_key="key1"
    )
    docs_result = MagicMock()
    docs_result.scalars().all.return_value = [mock_doc1]

    mock_db.execute.side_effect = [
        project_result,
        unified_chat_result,
        chats_result,
        docs_result
    ]

    with patch("app.rag.pipeline.retrieve_context", side_effect=ValueError("NO_CONTENT_RETRIEVED")):
        events = []
        async for event in query_unified(
            project_id=project_id,
            user_message="test query",
            provider="gemini",
            db=mock_db
        ):
            events.append(event)

        assert len(events) == 1
        data = json.loads(events[0].replace("data: ", "").strip())
        assert data["type"] == "error"
        assert data["code"] == "NO_CONTENT_RETRIEVED"
        mock_db.commit.assert_not_called()
