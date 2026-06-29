import pytest
from app.rag.pipeline import index_document
from llama_index.core import VectorStoreIndex

def test_index_document_txt():
    """Verify that index_document correctly parses and indexes a txt document."""
    file_bytes = b"Hello, this is a test document content. LlamaIndex should parse and chunk this properly."
    filename = "test_doc.txt"
    user_id = 123
    doc_id = 456

    result = index_document(file_bytes, filename, user_id, doc_id)

    assert "summary" in result
    assert "text" in result
    assert "index" in result

    assert "test_doc.txt" in result["summary"]
    assert "test document content" in result["text"]
    assert isinstance(result["index"], VectorStoreIndex)

def test_index_document_empty():
    """Verify that indexing an empty document raises ValueError('EMPTY_DOCUMENT')."""
    file_bytes = b""
    filename = "empty.txt"
    user_id = 123
    doc_id = 456

    with pytest.raises(ValueError, match="EMPTY_DOCUMENT"):
        index_document(file_bytes, filename, user_id, doc_id)

def test_index_document_whitespace():
    """Verify that indexing a whitespace-only document raises ValueError('EMPTY_DOCUMENT')."""
    file_bytes = b"   \n  \t   "
    filename = "whitespace.txt"
    user_id = 123
    doc_id = 456

    with pytest.raises(ValueError, match="EMPTY_DOCUMENT"):
        index_document(file_bytes, filename, user_id, doc_id)

