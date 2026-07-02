import os
import pytest
from app.config import settings
from app.rag.pipeline import index_document
from llama_index.core import VectorStoreIndex

def test_index_document_txt(monkeypatch, tmp_path):
    """Verify that index_document correctly parses and indexes a txt document."""
    # Override STORAGE_INDICES_DIR to use a temp directory during test
    monkeypatch.setattr(settings, "STORAGE_INDICES_DIR", str(tmp_path))

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

    # Verify index files creation on disk
    persist_dir = os.path.join(str(tmp_path), str(user_id), str(doc_id))
    assert os.path.exists(persist_dir)
    files = os.listdir(persist_dir)
    assert len(files) > 0
    assert any(f.endswith(".json") for f in files)

def test_index_document_override(monkeypatch, tmp_path):
    """Verify that calling index_document overrides the existing directory if it exists."""
    monkeypatch.setattr(settings, "STORAGE_INDICES_DIR", str(tmp_path))

    file_bytes = b"First index content"
    filename = "test_doc.txt"
    user_id = 123
    doc_id = 456

    # First call
    index_document(file_bytes, filename, user_id, doc_id)
    persist_dir = os.path.join(str(tmp_path), str(user_id), str(doc_id))
    assert os.path.exists(persist_dir)

    # Write a dummy file to the persist dir to check if it gets overridden/deleted
    dummy_file = os.path.join(persist_dir, "dummy.txt")
    with open(dummy_file, "w") as f:
        f.write("should be deleted")
    assert os.path.exists(dummy_file)

    # Second call - should override and delete the old folder/files
    index_document(b"Second index content", filename, user_id, doc_id)
    assert os.path.exists(persist_dir)
    assert not os.path.exists(dummy_file)

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

from unittest.mock import patch

@patch("app.rag.pipeline.delete_file")
@patch("app.rag.pipeline.VectorStoreIndex.from_documents")
def test_index_document_failure_rollback(mock_from_documents, mock_delete_file, monkeypatch, tmp_path):
    """Verify that a failure during indexing triggers Tigris cleanup and local index directory cleanup."""
    monkeypatch.setattr(settings, "STORAGE_INDICES_DIR", str(tmp_path))

    mock_from_documents.side_effect = Exception("Mock database or indexing error")

    file_bytes = b"Some valid document content to trigger the pipeline."
    filename = "test_doc.txt"
    user_id = 123
    doc_id = 456

    persist_dir = os.path.join(str(tmp_path), str(user_id), str(doc_id))
    # Pre-create directory to verify cleanup
    os.makedirs(persist_dir, exist_ok=True)
    assert os.path.exists(persist_dir)

    with pytest.raises(Exception, match="Mock database or indexing error"):
        index_document(file_bytes, filename, user_id, doc_id)

    # Verify S3/Tigris rollback delete_file was called
    mock_delete_file.assert_called_once_with(f"{user_id}/{doc_id}/{filename}")

    # Verify local directory cleanup occurred
    assert not os.path.exists(persist_dir)

