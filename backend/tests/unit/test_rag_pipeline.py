import tempfile
from unittest.mock import patch
from hypothesis import given, strategies as st
import pytest
from app.rag.pipeline import index_document
from app.config import settings

@given(
    content=st.text(alphabet=[" ", "\t", "\n", "\r", "\v", "\f"], min_size=0, max_size=500),
    ext=st.sampled_from([".txt", ".md"]),
    filename_base=st.text(min_size=1, max_size=50).filter(lambda s: "." not in s and "/" not in s and "\x00" not in s),
    user_id=st.integers(min_value=1, max_value=100000),
    doc_id=st.integers(min_value=1, max_value=100000)
)
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
