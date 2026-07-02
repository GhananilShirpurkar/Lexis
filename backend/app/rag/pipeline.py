import os
import tempfile
import shutil
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings
from llama_index.core.llms.mock import MockLLM
from llama_index.core.embeddings.mock import MockEmbedding
from llama_index.core.node_parser import SentenceSplitter
from app.config import settings
from app.storage.r2_client import delete_file

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
    Chunks the document using SentenceSplitter, and indexes the document nodes.
    Serializes the index locally under {STORAGE_INDICES_DIR}/{user_id}/{doc_id}.
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

        # Build index with SentenceSplitter
        splitter = SentenceSplitter()
        index = VectorStoreIndex.from_documents(documents, transformations=[splitter])

        # Serialize index locally under storage/indices/{user_id}/{doc_id}
        persist_dir = os.path.join(settings.STORAGE_INDICES_DIR, str(user_id), str(doc_id))
        if os.path.exists(persist_dir):
            shutil.rmtree(persist_dir)
        os.makedirs(persist_dir, exist_ok=True)
        index.storage_context.persist(persist_dir=persist_dir)

        # Generate a placeholder summary
        summary = f"Summary of {filename}: {full_text[:200]}..."

        return {
            "summary": summary,
            "text": full_text,
            "index": index
        }
    except Exception as e:
        # Rollback uploaded file from storage (Tigris)
        r2_key = f"{user_id}/{doc_id}/{filename}"
        try:
            delete_file(r2_key)
        except Exception:
            pass

        # Cleanup local persistent directory if it exists
        persist_dir = os.path.join(settings.STORAGE_INDICES_DIR, str(user_id), str(doc_id))
        if os.path.exists(persist_dir):
            try:
                shutil.rmtree(persist_dir)
            except Exception:
                pass

        raise e
    finally:
        # Cleanup temporary files
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
