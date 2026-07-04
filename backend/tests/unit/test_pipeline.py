import os
import pytest
from app.config import settings
from app.rag.pipeline import index_document
from llama_index.core import VectorStoreIndex

from unittest.mock import patch

@patch("app.rag.pipeline.generate_summary")
def test_index_document_txt(mock_generate, monkeypatch, tmp_path):
    """Verify that index_document correctly parses and indexes a txt document."""
    # Override STORAGE_INDICES_DIR to use a temp directory during test
    monkeypatch.setattr(settings, "STORAGE_INDICES_DIR", str(tmp_path))

    file_bytes = b"Hello, this is a test document content. LlamaIndex should parse and chunk this properly."
    filename = "test_doc.txt"
    user_id = 123
    doc_id = 456

    mock_generate.return_value = f"Summary of {filename}: Hello, this is a test document content."
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

@patch("app.rag.pipeline.generate_summary")
def test_index_document_override(mock_generate, monkeypatch, tmp_path):
    """Verify that calling index_document overrides the existing directory if it exists."""
    monkeypatch.setattr(settings, "STORAGE_INDICES_DIR", str(tmp_path))

    file_bytes = b"First index content"
    filename = "test_doc.txt"
    user_id = 123
    doc_id = 456

    mock_generate.return_value = "Summary"
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
@patch("app.rag.pipeline.generate_summary")
def test_index_document_failure_rollback(mock_generate, mock_from_documents, mock_delete_file, monkeypatch, tmp_path):
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


from unittest.mock import MagicMock
from app.rag.pipeline import generate_summary

@patch("app.rag.pipeline.genai.GenerativeModel")
@patch("app.rag.pipeline.genai.configure")
def test_generate_summary_gemini_success(mock_configure, mock_model_class, monkeypatch):
    """Verify that generate_summary successfully uses Gemini when API key is set."""
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "dummy-gemini-key")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")

    mock_model = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "This is a Gemini summary"
    mock_model.generate_content.return_value = mock_response
    mock_model_class.return_value = mock_model

    summary = generate_summary("Some document content", "test.txt")
    assert summary == "This is a Gemini summary"
    mock_configure.assert_called_once_with(api_key="dummy-gemini-key")
    mock_model_class.assert_called_once_with("gemini-1.5-flash")
    mock_model.generate_content.assert_called_once()


@patch("app.rag.pipeline.Groq")
@patch("app.rag.pipeline.genai.GenerativeModel")
def test_generate_summary_gemini_fails_groq_success(mock_genai_model, mock_groq_class, monkeypatch):
    """Verify that generate_summary falls back to Groq if Gemini fails."""
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "dummy-gemini-key")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "dummy-groq-key")

    # Make Gemini raise exception
    mock_genai_model.side_effect = Exception("Gemini connection error")

    # Mock Groq client
    mock_groq_client = MagicMock()
    mock_completion = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = "This is a Groq summary"
    mock_completion.choices = [mock_choice]
    mock_groq_client.chat.completions.create.return_value = mock_completion
    mock_groq_class.return_value = mock_groq_client

    summary = generate_summary("Some document content", "test.txt")
    assert summary == "This is a Groq summary"
    mock_groq_class.assert_called_once_with(api_key="dummy-groq-key")


@patch("app.rag.pipeline.Groq")
@patch("app.rag.pipeline.genai.GenerativeModel")
def test_generate_summary_all_fails(mock_genai_model, mock_groq_class, monkeypatch):
    """Verify that generate_summary returns empty string when both APIs fail."""
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "dummy-gemini-key")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "dummy-groq-key")

    mock_genai_model.side_effect = Exception("Gemini error")
    mock_groq_client = MagicMock()
    mock_groq_client.chat.completions.create.side_effect = Exception("Groq error")
    mock_groq_class.return_value = mock_groq_client

    summary = generate_summary("Some document content", "test.txt")
    assert summary == ""


def test_generate_summary_no_keys(monkeypatch):
    """Verify that generate_summary returns empty string immediately if no keys are set."""
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")

    summary = generate_summary("Some document content", "test.txt")
    assert summary == ""


@patch("app.rag.pipeline.genai.GenerativeModel")
@patch("app.rag.pipeline.genai.configure")
def test_generate_summary_truncates_input(mock_configure, mock_model_class, monkeypatch):
    """Verify that generate_summary truncates input text to 10,000 characters."""
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "dummy-gemini-key")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")

    mock_model = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "Summary"
    mock_model.generate_content.return_value = mock_response
    mock_model_class.return_value = mock_model

    # Text of 12,000 characters
    long_text = "a" * 12000
    generate_summary(long_text, "test.txt")

    mock_model.generate_content.assert_called_once()
    args, kwargs = mock_model.generate_content.call_args
    prompt_sent = args[0]
    
    # Assert that prompt doesn't contain the full 12,000 characters
    # 12,000 'a's truncated to 10,000 'a's
    assert "a" * 10000 in prompt_sent
    assert "a" * 10001 not in prompt_sent

