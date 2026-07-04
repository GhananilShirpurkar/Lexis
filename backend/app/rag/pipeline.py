import os
import tempfile
import shutil
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings
from llama_index.core.llms.mock import MockLLM
from llama_index.core.embeddings.mock import MockEmbedding
from llama_index.core.node_parser import SentenceSplitter
from app.config import settings
from app.storage.r2_client import delete_file
import logging
import google.generativeai as genai
from groq import Groq

logger = logging.getLogger(__name__)

SUMMARIZATION_PROMPT = (
    "You are an expert summarizer. Summarize the following document.\n"
    "Document name: {filename}\n"
    "Document content:\n"
    "{text}\n\n"
    "Guidelines:\n"
    "- Provide a plain-text summary describing the contents.\n"
    "- Do not use markdown formatting (like bold, italics, bullets, headers). Use plain text paragraphs.\n"
    "- The summary must be strictly under 150 words and under 5000 characters.\n"
)

def generate_summary(text: str, filename: str) -> str:
    """
    Generates a summary of the document using LLM.
    Attempts Gemini first, falls back to Groq if Gemini fails or is unconfigured,
    and falls back to an empty string if both fail or are unconfigured.
    Truncates input text to 10,000 characters for token efficiency.
    """
    truncated_text = text[:10000]
    prompt = SUMMARIZATION_PROMPT.format(filename=filename, text=truncated_text)

    # 1. Try Gemini
    if settings.GEMINI_API_KEY:
        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            if response and response.text:
                return response.text.strip()
        except Exception as e:
            logger.warning(f"Gemini summarization failed, trying Groq: {e}")

    # 2. Try Groq (Fallback)
    if settings.GROQ_API_KEY:
        try:
            client = Groq(api_key=settings.GROQ_API_KEY)
            completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama3-8b-8192",
            )
            if completion and completion.choices and completion.choices[0].message.content:
                return completion.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"Groq summarization failed: {e}")

    # 3. Final fallback: empty string
    return ""

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

        # Generate summary using the LLM provider pipeline
        summary = generate_summary(full_text, filename)

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
