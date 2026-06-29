import os
import tempfile
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings
from llama_index.core.llms.mock import MockLLM
from llama_index.core.embeddings.mock import MockEmbedding

# Global configuration to avoid default OpenAI API key errors
Settings.llm = MockLLM()
Settings.embed_model = MockEmbedding(embed_dim=1536)

def index_document(
    file_bytes: bytes,
    filename: str,
    user_id: str | int,
    doc_id: str | int
) -> dict:
    """
    Parses document bytes according to its extension using LlamaIndex readers.
    Chunks the document using default LlamaIndex settings, and indexes the document nodes.
    Returns a dictionary with the index reference, full text, and initial summary.
    """
    _, ext = os.path.splitext(filename)

    # SimpleDirectoryReader expects physical files on disk
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp_file:
        tmp_file.write(file_bytes)
        tmp_path = tmp_file.name

    try:
        reader = SimpleDirectoryReader(input_files=[tmp_path])
        documents = reader.load_data()

        # Extract complete parsed text
        full_text = "\n".join([doc.text for doc in documents]).strip()

        if not full_text:
            raise ValueError("EMPTY_DOCUMENT")

        # Build index
        index = VectorStoreIndex.from_documents(documents)

        # Generate a placeholder summary
        summary = f"Summary of {filename}: {full_text[:200]}..."

        return {
            "summary": summary,
            "text": full_text,
            "index": index
        }
    finally:
        # Cleanup temporary files
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
