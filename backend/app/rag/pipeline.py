import os
import tempfile
import shutil
import uuid
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings
from llama_index.core.llms.mock import MockLLM
from llama_index.core.embeddings import MockEmbedding
from llama_index.core.node_parser import SentenceSplitter
from app.config import settings
from app.storage.r2_client import delete_file
import logging
from google import genai
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
    Attempts Gemini first (via modern google.genai SDK), falls back to Groq,
    and falls back to an algorithmic summary if unconfigured or failed.
    """
    if settings.FORCE_MOCK_LLM:
        return f"Simulated summary for '{filename}': The document details key concepts and references with an overall size of {len(text)} characters. Eager-loaded in vector index and ready for search queries."

    truncated_text = text[:10000]
    prompt = SUMMARIZATION_PROMPT.format(filename=filename, text=truncated_text)

    # 1. Try Gemini via modern google.genai SDK
    if settings.GEMINI_API_KEY:
        try:
            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            for m in ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"]:
                try:
                    res = client.models.generate_content(model=m, contents=prompt)
                    if res and res.text:
                        return res.text.strip()
                except Exception as m_err:
                    logger.debug(f"google.genai summarization model {m} failed: {m_err}")
                    continue
        except Exception as e:
            logger.warning(f"google.genai summarization failed: {e}")

    # 2. Try Groq (Fallback)
    if settings.GROQ_API_KEY:
        try:
            client = Groq(api_key=settings.GROQ_API_KEY)
            for m in ["llama-3.3-70b-versatile", "llama3-8b-8192", "mixtral-8x7b-32768"]:
                try:
                    completion = client.chat.completions.create(
                        messages=[{"role": "user", "content": prompt}],
                        model=m,
                    )
                    if completion and completion.choices and completion.choices[0].message.content:
                        return completion.choices[0].message.content.strip()
                except Exception as m_err:
                    logger.debug(f"Groq summarization model {m} failed: {m_err}")
                    continue
        except Exception as e:
            logger.warning(f"Groq summarization failed: {e}")

    # 3. Dynamic excerpt fallback if API unavailable
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    summary_excerpt = " ".join(lines[:3]) if lines else text[:300]
    return f"Document summary for '{filename}': {summary_excerpt[:350]}..."

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
        file_extractor = {}
        if ext.lower() == ".pdf":
            pdf_reader_obj = None
            try:
                from llama_index.readers.file import PyPDFReader
                pdf_reader_obj = PyPDFReader()
            except Exception:
                try:
                    from pypdf import PdfReader
                    from llama_index.core import Document as LlamaDocument

                    class CustomPyPDFReader:
                        def load_data(self, file_path, extra_info=None):
                            reader = PdfReader(file_path)
                            docs = []
                            for i, page in enumerate(reader.pages):
                                text = page.extract_text() or ""
                                if text.strip():
                                    metadata = {"page_label": i + 1, "file_name": filename}
                                    if extra_info:
                                        metadata.update(extra_info)
                                    docs.append(LlamaDocument(text=text, metadata=metadata))
                            return docs

                    pdf_reader_obj = CustomPyPDFReader()
                except Exception as e:
                    logger.warning(f"Could not load PDF reader: {e}")

            if pdf_reader_obj:
                file_extractor[".pdf"] = pdf_reader_obj

        reader = SimpleDirectoryReader(input_files=[tmp_path], file_extractor=file_extractor)
        documents = reader.load_data()

        # Enforce original filename in metadata for clean citations and LLM context
        for doc in documents:
            doc.metadata["file_name"] = filename

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


def retrieve_context(user_id: str, doc_id: str, query: str, top_k: int = 5) -> list:
    """
    Loads the serialized index for the given user_id and doc_id,
    and retrieves up to top_k (default 5) relevant nodes/chunks.
    If no chunks are retrieved, raises ValueError("NO_CONTENT_RETRIEVED").
    """
    from llama_index.core import StorageContext, load_index_from_storage

    persist_dir = os.path.join(settings.STORAGE_INDICES_DIR, str(user_id), str(doc_id))
    if not os.path.exists(persist_dir):
        raise FileNotFoundError(f"Index directory {persist_dir} does not exist")
    
    storage_context = StorageContext.from_defaults(persist_dir=persist_dir)
    index = load_index_from_storage(storage_context)
    
    retriever = index.as_retriever(similarity_top_k=top_k)
    nodes = retriever.retrieve(query)
    
    if not nodes:
        raise ValueError("NO_CONTENT_RETRIEVED")
        
    return nodes


def build_prompt(query: str, nodes: list) -> str:
    """
    Combines retrieved context chunks, system prompt, and user query.
    Enforces adaptive depth, clean markdown syntax, and standard [Page X] inline citations.
    """
    system_prompt = (
        "You are Lexis, an expert precision retrieval assistant for documents.\n\n"
        "Core Response Guidelines:\n"
        "1. ADAPTIVE DEPTH: Analyze the user query. If it's a brief/direct question (e.g. 'what is X?', 'when does Y happen?'), provide a direct, concise 1-2 sentence response. If it's complex, architectural, or broad (e.g. 'how is X implemented?', 'summarize...'), provide a detailed, deeply technical response with section subheadings and bullet points.\n"
        "2. FORMATTING: Use clean Markdown formatting (e.g. `### Section`, `**bold key terms**`, bullet lists). Do NOT include robotic preamble phrases like 'According to document X' or 'The document states'. Answer directly.\n"
        "3. TYPO CORRECTION: Clean up document hyphenation artifacts or OCR errors (e.g. convert 'enhance- ments' to 'enhancements').\n"
        "4. CITATIONS: For every claim or detail retrieved, attach an inline citation tag at the end of the sentence using the exact syntax `[Page X]` (where X is the page number from context). If multiple pages apply, use `[Page X, Y]`.\n"
        "5. TRUTHFULNESS: Base your answers ONLY on the provided context below. If the context does not contain the answer, state: 'The provided document does not contain information to answer this query.'\n\n"
        "Retrieved Document Context:\n{context}\n\n"
        "User Inquiry: {query}"
    )

    context_str = ""
    for i, node in enumerate(nodes):
        metadata = node.node.metadata or {}
        page_num = metadata.get("page_label", metadata.get("page_num", "unknown"))
        file_name = metadata.get("file_name", "document")
        context_str += f"--- Chunk {i+1} (Source: {file_name}, Page: {page_num}) ---\n"
        context_str += node.node.text.strip() + "\n\n"
        
    return system_prompt.format(context=context_str.strip(), query=query)


async def query(
    chat_id: str | uuid.UUID,
    user_message: str,
    provider: str,
    db: AsyncSession
) -> AsyncGenerator[str, None]:
    """
    Executes a RAG query query pipeline:
    1. Loads the VectorStoreIndex for the chat's document.
    2. Retrieves context chunks.
    3. Builds the prompt.
    4. Streams tokens from selected provider with retry logic.
    5. Deduplicates citations and yields a 'done' SSE event.
    6. Persists the user and assistant messages to database atomically.
    """
    import asyncio
    import json
    import uuid
    from datetime import datetime, timezone
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.models.chat import Chat
    from app.models.message import Message
    from app.models.citation import Citation

    # 1. Fetch chat
    chat_query = select(Chat).where(Chat.id == chat_id)
    chat_result = await db.execute(chat_query)
    chat = chat_result.scalars().first()
    if not chat:
        yield f"data: {json.dumps({'type': 'error', 'code': 'CHAT_NOT_FOUND', 'message': 'Chat session not found'})}\n\n"
        return

    if not chat.current_doc_id:
        yield f"data: {json.dumps({'type': 'error', 'code': 'NO_DOCUMENT_ASSOCIATED', 'message': 'No document is associated with this chat'})}\n\n"
        return

    # 2. Retrieve chunks (up to 5)
    try:
        nodes = retrieve_context(chat.user_id, chat.current_doc_id, user_message, top_k=5)
    except ValueError as val_err:
        if str(val_err) == "NO_CONTENT_RETRIEVED":
            yield f"data: {json.dumps({'type': 'error', 'code': 'NO_CONTENT_RETRIEVED', 'message': 'No relevant context found'})}\n\n"
            return
        else:
            yield f"data: {json.dumps({'type': 'error', 'code': 'RETRIEVAL_ERROR', 'message': str(val_err)})}\n\n"
            return
    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'code': 'RETRIEVAL_ERROR', 'message': str(exc)})}\n\n"
        return

    # 3. Build prompt
    prompt = build_prompt(user_message, nodes)

    # 4. Stream LLM tokens
    from app.rag.providers import stream_gemini, stream_groq, LLMUnavailableError
    full_response = ""
    try:
        if provider == "gemini":
            stream_gen = stream_gemini(prompt)
        elif provider == "groq":
            stream_gen = stream_groq(prompt)
        else:
            yield f"data: {json.dumps({'type': 'error', 'code': 'INVALID_PROVIDER', 'message': f'Unsupported provider: {provider}'})}\n\n"
            return

        async for token in stream_gen:
            full_response += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

    except LLMUnavailableError as err:
        yield f"data: {json.dumps({'type': 'error', 'code': 'PROVIDER_UNAVAILABLE', 'message': str(err)})}\n\n"
        return
    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'code': 'LLM_ERROR', 'message': str(exc)})}\n\n"
        return

    # 5. Extract full verbatim citations per page/node
    grouped_citations_data = []
    seen_page_keys = set()

    for node in nodes:
        metadata = node.node.metadata or {}
        doc_filename = metadata.get("file_name", "document")
        page_num = metadata.get("page_label", metadata.get("page_num", None))
        if page_num is not None:
            try:
                page_num = int(page_num)
            except ValueError:
                page_num = None

        full_text = node.node.text.strip()
        doc_id = chat.current_doc_id

        page_key = (str(doc_id), page_num)
        if page_key in seen_page_keys:
            for c_item in grouped_citations_data:
                if c_item["document_id"] == str(doc_id) and c_item["page_number"] == page_num:
                    if full_text not in c_item["excerpt"]:
                        c_item["excerpt"] += "\n\n" + full_text
                    break
        else:
            seen_page_keys.add(page_key)
            grouped_citations_data.append({
                "document_id": str(doc_id),
                "excerpt": full_text,
                "page_number": page_num,
                "doc_filename": doc_filename
            })

    # 6. Save messages to NeonDB atomically BEFORE yielding done event
    try:
        user_msg = Message(
            id=uuid.uuid4(),
            chat_id=chat.id,
            user_id=chat.user_id,
            role="user",
            content=user_message,
            provider=provider,
            doc_id=chat.current_doc_id
        )
        assistant_msg = Message(
            id=uuid.uuid4(),
            chat_id=chat.id,
            user_id=chat.user_id,
            role="assistant",
            content=full_response,
            provider=provider,
            doc_id=chat.current_doc_id
        )
        db.add(user_msg)
        db.add(assistant_msg)
        await db.flush()

        for c_data in grouped_citations_data:
            citation_obj = Citation(
                id=uuid.uuid4(),
                message_id=assistant_msg.id,
                document_id=uuid.UUID(c_data["document_id"]),
                excerpt=c_data["excerpt"],
                page_number=c_data["page_number"]
            )
            db.add(citation_obj)
        
        chat.last_provider = provider
        await db.commit()
    except asyncio.CancelledError:
        logger.info("SSE connection cancelled. Rolling back transaction.")
        await db.rollback()
        raise
    except Exception as db_exc:
        logger.error(f"Error persisting conversation to database: {db_exc}")
        await db.rollback()
        raise

    # 7. Yield done chunk with citations AFTER commit is guaranteed
    yield f"data: {json.dumps({'type': 'done', 'citations': grouped_citations_data})}\n\n"


async def query_unified(
    project_id: str | uuid.UUID,
    user_message: str,
    provider: str,
    db: AsyncSession
) -> AsyncGenerator[str, None]:
    """
    Executes a RAG query pipeline across all documents in a project's member chats:
    1. Fetches all member chats and their associated documents.
    2. Retrieves up to 5 chunks from each active, unexpired document.
    3. Merges all retrieved chunks, deduplicates them by text content, and selects the top 5 by score.
    4. If no chunks retrieved, yields NO_CONTENT_RETRIEVED error and returns.
    5. Streams tokens from selected provider with retry logic.
    6. Deduplicates citations per document and yields a 'done' SSE event.
    7. Persists user/assistant messages and citations atomically (user_msg and assistant_msg doc_id is None).
    """
    import asyncio
    import json
    import uuid
    from datetime import datetime, timezone
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.models.project import Project, ProjectChat
    from app.models.chat import Chat
    from app.models.document import Document
    from app.models.message import Message
    from app.models.citation import Citation

    # 1. Fetch project and get its user_id
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalars().first()
    if not project:
        yield f"data: {json.dumps({'type': 'error', 'code': 'PROJECT_NOT_FOUND', 'message': 'Project not found'})}\n\n"
        return

    # Find the Unified Chat of the project.
    unified_chat_result = await db.execute(
        select(Chat).where(Chat.project_id == project_id, Chat.is_unified == True)
    )
    unified_chat = unified_chat_result.scalars().first()
    if not unified_chat:
        yield f"data: {json.dumps({'type': 'error', 'code': 'UNIFIED_CHAT_NOT_FOUND', 'message': 'Unified chat not found for project'})}\n\n"
        return

    # Fetch member chats
    chats_result = await db.execute(
        select(Chat)
        .join(ProjectChat, ProjectChat.chat_id == Chat.id)
        .where(ProjectChat.project_id == project_id)
    )
    member_chats = chats_result.scalars().all()

    # 2. Collect documents
    doc_ids = [c.current_doc_id for c in member_chats if c.current_doc_id is not None]
    if not doc_ids:
        yield f"data: {json.dumps({'type': 'error', 'code': 'NO_CONTENT_RETRIEVED', 'message': 'No documents associated with project chats'})}\n\n"
        return

    docs_result = await db.execute(
        select(Document).where(Document.id.in_(doc_ids))
    )
    documents = docs_result.scalars().all()

    active_docs = []
    now_utc = datetime.now(timezone.utc)
    for doc in documents:
        if doc.status == "active" and (doc.expiry_at is None or doc.expiry_at > now_utc):
            active_docs.append(doc)

    if not active_docs:
        yield f"data: {json.dumps({'type': 'error', 'code': 'NO_CONTENT_RETRIEVED', 'message': 'No active or unexpired documents in project'})}\n\n"
        return

    # 3. Retrieve and merge chunks (up to 5 per document, then merge and take top 5)
    all_nodes = []
    for doc in active_docs:
        try:
            nodes = retrieve_context(project.user_id, doc.id, user_message, top_k=5)
            for node in nodes:
                # Enrich node metadata so we can associate citation to the correct document
                node.node.metadata["document_id"] = str(doc.id)
                node.node.metadata["file_name"] = doc.filename
            all_nodes.extend(nodes)
        except ValueError as val_err:
            if str(val_err) == "NO_CONTENT_RETRIEVED":
                continue
            else:
                yield f"data: {json.dumps({'type': 'error', 'code': 'RETRIEVAL_ERROR', 'message': str(val_err)})}\n\n"
                return
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'code': 'RETRIEVAL_ERROR', 'message': str(exc)})}\n\n"
            return

    # Deduplicate nodes by text to prevent identical chunks from different files or sections
    seen_texts = set()
    unique_nodes = []
    for node in all_nodes:
        text_content = node.node.text.strip()
        if text_content not in seen_texts:
            seen_texts.add(text_content)
            unique_nodes.append(node)

    # Sort by score descending and take top 5 overall
    unique_nodes.sort(key=lambda x: x.score or 0.0, reverse=True)
    top_nodes = unique_nodes[:5]

    if not top_nodes:
        yield f"data: {json.dumps({'type': 'error', 'code': 'NO_CONTENT_RETRIEVED', 'message': 'No relevant context found'})}\n\n"
        return

    # 4. Build prompt
    prompt = build_prompt(user_message, top_nodes)

    # 5. Stream LLM tokens
    from app.rag.providers import stream_gemini, stream_groq, LLMUnavailableError
    full_response = ""
    try:
        if provider == "gemini":
            stream_gen = stream_gemini(prompt)
        elif provider == "groq":
            stream_gen = stream_groq(prompt)
        else:
            yield f"data: {json.dumps({'type': 'error', 'code': 'INVALID_PROVIDER', 'message': f'Unsupported provider: {provider}'})}\n\n"
            return

        async for token in stream_gen:
            full_response += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

    except LLMUnavailableError as err:
        yield f"data: {json.dumps({'type': 'error', 'code': 'PROVIDER_UNAVAILABLE', 'message': str(err)})}\n\n"
        return
    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'code': 'LLM_ERROR', 'message': str(exc)})}\n\n"
        return

    # 6. Extract full verbatim citations per page/node
    grouped_citations_data = []
    seen_page_keys = set()

    for node in top_nodes:
        metadata = node.node.metadata or {}
        doc_filename = metadata.get("file_name", "document")
        doc_id_str = metadata.get("document_id")
        if not doc_id_str:
            continue

        page_num = metadata.get("page_label", metadata.get("page_num", None))
        if page_num is not None:
            try:
                page_num = int(page_num)
            except ValueError:
                page_num = None

        full_text = node.node.text.strip()
        page_key = (doc_id_str, page_num)

        if page_key in seen_page_keys:
            for c_item in grouped_citations_data:
                if c_item["document_id"] == doc_id_str and c_item["page_number"] == page_num:
                    if full_text not in c_item["excerpt"]:
                        c_item["excerpt"] += "\n\n" + full_text
                    break
        else:
            seen_page_keys.add(page_key)
            grouped_citations_data.append({
                "document_id": doc_id_str,
                "excerpt": full_text,
                "page_number": page_num,
                "doc_filename": doc_filename
            })

    # 7. Save messages to NeonDB atomically BEFORE yielding done event
    try:
        user_msg = Message(
            id=uuid.uuid4(),
            chat_id=unified_chat.id,
            user_id=unified_chat.user_id,
            role="user",
            content=user_message,
            provider=provider,
            doc_id=None
        )
        assistant_msg = Message(
            id=uuid.uuid4(),
            chat_id=unified_chat.id,
            user_id=unified_chat.user_id,
            role="assistant",
            content=full_response,
            provider=provider,
            doc_id=None
        )
        db.add(user_msg)
        db.add(assistant_msg)
        await db.flush()

        for c_data in grouped_citations_data:
            citation_obj = Citation(
                id=uuid.uuid4(),
                message_id=assistant_msg.id,
                document_id=uuid.UUID(c_data["document_id"]),
                excerpt=c_data["excerpt"],
                page_number=c_data["page_number"]
            )
            db.add(citation_obj)
        
        unified_chat.last_provider = provider
        await db.commit()
    except asyncio.CancelledError:
        logger.info("SSE connection cancelled. Rolling back transaction.")
        await db.rollback()
        raise
    except Exception as db_exc:
        logger.error(f"Error persisting conversation to database: {db_exc}")
        await db.rollback()
        raise

    # 8. Yield done chunk with citations AFTER commit is guaranteed
    yield f"data: {json.dumps({'type': 'done', 'citations': grouped_citations_data})}\n\n"

