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
            client = genai.Client(api_key=settings.GEMINI_API_KEY, http_options={"timeout": 30000})
            for m in ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"]:
                try:
                    res = client.models.generate_content(model=m, contents=prompt)
                    if res and res.text:
                        return res.text.strip()
                except Exception as m_err:
                    logger.error(f"model {m} failed: {type(m_err).__name__}: {repr(m_err)}", exc_info=True)
                    err_str = str(m_err).lower()
                    if any(term in err_str for term in ["401", "403", "invalid_api_key", "unauthorized"]):
                        break
                    continue
        except Exception as e:
            logger.error(f"google.genai summarization failed: {type(e).__name__}: {repr(e)}", exc_info=True)

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
                    logger.error(f"model {m} failed: {type(m_err).__name__}: {repr(m_err)}", exc_info=True)
                    err_str = str(m_err).lower()
                    if any(term in err_str for term in ["401", "403", "invalid_api_key", "unauthorized"]):
                        break
                    continue
        except Exception as e:
            logger.error(f"Groq summarization failed: {type(e).__name__}: {repr(e)}", exc_info=True)

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


def build_prompt_with_web(query: str, doc_nodes: list | None, web_results: list[dict]) -> str:
    """
    Builds a combined prompt with both document context and web search results.
    Adapts the system instructions based on which source types are present.
    """
    has_docs = doc_nodes and len(doc_nodes) > 0
    has_web = web_results and len(web_results) > 0

    # Build citation instructions based on available sources
    citation_instructions = ""
    if has_docs and has_web:
        citation_instructions = (
            "4. CITATIONS: For document-sourced claims, attach `[Page X]` (where X is page number). "
            "For web-sourced claims, attach `[Web N: Title](url)` (where N is web source number 1..N, Title is brief title, url is the web link). "
            "Always attribute each fact directly to its source.\n"
        )
    elif has_docs:
        citation_instructions = (
            "4. CITATIONS: For every claim or detail retrieved, attach an inline citation tag "
            "using the exact syntax `[Page X]`.\n"
        )
    elif has_web:
        citation_instructions = (
            "4. CITATIONS: For every web-sourced claim, attach `[Web N: Title](url)` (where N is web source number 1..N, Title is brief title, url is the web link). "
            "Always attribute each fact directly to its source.\n"
        )

    truthfulness = (
        "5. TRUTHFULNESS: Base your answers on the provided context below. "
        "If the context does not contain the answer, answer using general knowledge while noting limitations.\n"
    )

    system_prompt = (
        "You are Lexis, an expert precision retrieval assistant.\n\n"
        "Core Response Guidelines:\n"
        "1. ADAPTIVE DEPTH: Analyze the user query. If it's brief/direct, provide a concise 1-2 sentence response. "
        "If it's complex or broad, provide a detailed response with section subheadings and bullet points.\n"
        "2. FORMATTING: Use clean Markdown formatting (e.g. `### Section`, `**bold key terms**`, bullet lists). "
        "Do NOT include robotic preamble phrases. Answer directly.\n"
        "3. TYPO CORRECTION: Clean up document hyphenation artifacts or OCR errors.\n"
        + citation_instructions
        + truthfulness
    )

    # Build document context block
    context_parts = []
    if has_docs:
        context_parts.append("[Document Sources]")
        for i, node in enumerate(doc_nodes):
            metadata = node.node.metadata or {}
            page_num = metadata.get("page_label", metadata.get("page_num", "unknown"))
            file_name = metadata.get("file_name", "document")
            context_parts.append(f"--- Chunk {i+1} (Source: {file_name}, Page: {page_num}) ---")
            context_parts.append(node.node.text.strip())
            context_parts.append("")

    # Build web context block
    if has_web:
        context_parts.append("[Web Sources]")
        for i, result in enumerate(web_results):
            title = result.get("title", "Untitled")
            url = result.get("url", "")
            content = result.get("content", "")
            context_parts.append(f"--- Web {i+1}: {title} ({url}) ---")
            context_parts.append(content.strip())
            context_parts.append("")

    if not has_docs and not has_web:
        context_parts.append("(No external document or web context retrieved. Rely on general AI knowledge.)")

    context_str = "\n".join(context_parts).strip()

    full_prompt = (
        system_prompt + "\n\n"
        "Retrieved Context:\n" + context_str + "\n\n"
        "User Inquiry: " + query
    )

    return full_prompt


async def query(
    chat_id: str | uuid.UUID,
    user_message: str,
    provider: str,
    db: AsyncSession,
    web_search_enabled: bool = False
) -> AsyncGenerator[str, None]:
    """
    Executes a RAG query pipeline:
    1. Loads the VectorStoreIndex for the chat's document (if present).
    2. Retrieves context chunks from local index.
    3. Optionally runs Tavily web search in parallel with graceful fallback.
    4. Builds the prompt (doc-only, web-only, or combined).
    5. Streams tokens from selected provider with retry logic.
    6. Deduplicates citations and yields a 'done' SSE event with web_sources and system_warning.
    7. Persists the user and assistant messages to database atomically.
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

    # Document requirement check — bypassed when web search is enabled
    if not chat.current_doc_id and not web_search_enabled:
        yield f"data: {json.dumps({'type': 'error', 'code': 'NO_DOCUMENT_ASSOCIATED', 'message': 'No document is associated with this chat'})}\n\n"
        return

    # 2. Retrieve document chunks (if a document is attached)
    nodes = None
    if chat.current_doc_id:
        try:
            nodes = retrieve_context(chat.user_id, chat.current_doc_id, user_message, top_k=5)
        except ValueError as val_err:
            if str(val_err) == "NO_CONTENT_RETRIEVED":
                nodes = None  # No doc results — acceptable
                if not web_search_enabled:
                    yield f"data: {json.dumps({'type': 'error', 'code': 'NO_CONTENT_RETRIEVED', 'message': 'No relevant context found in document'})}\n\n"
                    return
            else:
                if not web_search_enabled:
                    yield f"data: {json.dumps({'type': 'error', 'code': 'RETRIEVAL_ERROR', 'message': str(val_err)})}\n\n"
                    return
                nodes = None
        except Exception as exc:
            if not web_search_enabled:
                yield f"data: {json.dumps({'type': 'error', 'code': 'RETRIEVAL_ERROR', 'message': str(exc)})}\n\n"
                return
            else:
                logger.warning(f"Document retrieval failed but web search enabled, continuing: {exc}")
                nodes = None

    # 3. Run web search if enabled
    web_results = []
    system_warning = None
    if web_search_enabled:
        try:
            from app.rag.web_search import search_web
            web_results, system_warning = search_web(user_message)
        except Exception as web_err:
            logger.warning(f"Web search failed, continuing with local RAG / LLM: {web_err}")
            web_results = []
            system_warning = "Web search service unavailable"

    # Emit web search status event so frontend knows search completed (or failed)
    if web_search_enabled:
        status_event = {'type': 'web_search_status', 'count': len(web_results)}
        if system_warning:
            status_event['warning'] = system_warning
        yield f"data: {json.dumps(status_event)}\n\n"

    # 4. Build prompt
    if web_results or web_search_enabled:
        prompt = build_prompt_with_web(user_message, nodes, web_results)
    else:
        prompt = build_prompt(user_message, nodes)

    # 5. Stream LLM tokens
    from app.rag.providers import stream_gemini, stream_groq, LLMUnavailableError
    from app.core.circuit_breaker import CircuitBreakerOpenException
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

    except CircuitBreakerOpenException as cbe:
        yield f"data: {json.dumps({'type': 'error', 'code': 'CIRCUIT_OPEN', 'message': cbe.message})}\n\n"
        return
    except LLMUnavailableError as err:
        yield f"data: {json.dumps({'type': 'error', 'code': 'PROVIDER_UNAVAILABLE', 'message': str(err)})}\n\n"
        return
    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'code': 'LLM_ERROR', 'message': str(exc)})}\n\n"
        return

    # 6. Extract document citations (only for doc-sourced nodes)
    grouped_citations_data = []
    if nodes:
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

    # Build ephemeral web_sources payload (not persisted to DB)
    web_sources_data = []
    for r in web_results:
        web_sources_data.append({
            "title": r.get("title", "Untitled"),
            "url": r.get("url", ""),
            "snippet": (r.get("content", "")[:200] + "...") if len(r.get("content", "")) > 200 else r.get("content", "")
        })

    # 7. Save messages to NeonDB atomically BEFORE yielding done event
    try:
        from datetime import timedelta
        now_time = datetime.now(timezone.utc)
        user_msg = Message(
            id=uuid.uuid4(),
            chat_id=chat.id,
            user_id=chat.user_id,
            role="user",
            content=user_message,
            provider=None,
            doc_id=chat.current_doc_id,
            created_at=now_time - timedelta(milliseconds=50)
        )
        assistant_msg = Message(
            id=uuid.uuid4(),
            chat_id=chat.id,
            user_id=chat.user_id,
            role="assistant",
            content=full_response,
            provider=provider,
            doc_id=chat.current_doc_id,
            created_at=now_time
        )
        db.add(user_msg)
        db.add(assistant_msg)
        await db.flush()

        # Bulk insert document citations via PostgreSQL Core (web sources are ephemeral)
        if grouped_citations_data:
            citation_values = [
                {
                    "id": uuid.uuid4(),
                    "message_id": assistant_msg.id,
                    "document_id": uuid.UUID(c_data["document_id"]),
                    "excerpt": c_data["excerpt"],
                    "page_number": c_data["page_number"]
                }
                for c_data in grouped_citations_data
            ]
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            BATCH_SIZE = 500
            for i in range(0, len(citation_values), BATCH_SIZE):
                chunk = citation_values[i:i + BATCH_SIZE]
                stmt = pg_insert(Citation).values(chunk)
                await db.execute(stmt)

        chat.last_provider = provider
        await db.commit()
        try:
            from app.cache import cache
            await cache.delete_pattern(f"chat:{chat_id}:messages:*")
            await cache.delete(f"chat:{chat_id}:meta")
            await cache.delete_pattern(f"user:{chat.user_id}:chats:*")
        except Exception:
            pass
    except asyncio.CancelledError:
        logger.info("SSE connection cancelled. Rolling back transaction.")
        await db.rollback()
        raise
    except Exception as db_exc:
        logger.error(f"Error persisting conversation to database: {db_exc}")
        await db.rollback()
        raise

    # 8. Yield done chunk with citations AND web_sources AFTER commit is guaranteed
    done_payload = {
        'type': 'done',
        'citations': grouped_citations_data,
        'message_id': str(assistant_msg.id)
    }
    if web_sources_data:
        done_payload['web_sources'] = web_sources_data
    if system_warning:
        done_payload['system_warning'] = system_warning
    yield f"data: {json.dumps(done_payload)}\n\n"


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
    from app.core.circuit_breaker import CircuitBreakerOpenException
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

    except CircuitBreakerOpenException as cbe:
        yield f"data: {json.dumps({'type': 'error', 'code': 'CIRCUIT_OPEN', 'message': cbe.message})}\n\n"
        return
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
        from datetime import timedelta
        now_time = datetime.now(timezone.utc)
        user_msg = Message(
            id=uuid.uuid4(),
            chat_id=unified_chat.id,
            user_id=unified_chat.user_id,
            role="user",
            content=user_message,
            provider=None,
            doc_id=None,
            created_at=now_time - timedelta(milliseconds=50)
        )
        assistant_msg = Message(
            id=uuid.uuid4(),
            chat_id=unified_chat.id,
            user_id=unified_chat.user_id,
            role="assistant",
            content=full_response,
            provider=provider,
            doc_id=None,
            created_at=now_time
        )
        db.add(user_msg)
        db.add(assistant_msg)
        await db.flush()

        # Bulk insert document citations via PostgreSQL Core
        if grouped_citations_data:
            citation_values = [
                {
                    "id": uuid.uuid4(),
                    "message_id": assistant_msg.id,
                    "document_id": uuid.UUID(c_data["document_id"]),
                    "excerpt": c_data["excerpt"],
                    "page_number": c_data["page_number"]
                }
                for c_data in grouped_citations_data
            ]
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            BATCH_SIZE = 500
            for i in range(0, len(citation_values), BATCH_SIZE):
                chunk = citation_values[i:i + BATCH_SIZE]
                stmt = pg_insert(Citation).values(chunk)
                await db.execute(stmt)
        
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
    done_payload = {
        'type': 'done',
        'citations': grouped_citations_data,
        'message_id': str(assistant_msg.id)
    }
    yield f"data: {json.dumps(done_payload)}\n\n"


async def query_workspace(
    workspace_id: str | uuid.UUID,
    workspace_chat_id: str | uuid.UUID,
    user_message: str,
    provider: str,
    db: AsyncSession
) -> AsyncGenerator[str, None]:
    """
    Executes a workspace-scoped RAG query pipeline:
    1. Fetches all member chats and their associated documents.
    2. Parallel retrieves up to 5 chunks from each document via asyncio.gather.
    3. Fetches last 10 messages from each member chat + workspace chat as context.
    4. Builds a workspace-aware prompt with source attribution.
    5. Streams LLM tokens and persists messages with cross-document citations.
    """
    import asyncio
    import json
    import uuid as uuid_mod
    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.models.workspace import Workspace, WorkspaceChat as WorkspaceChatModel, WorkspaceChatMetadata
    from app.models.chat import Chat
    from app.models.document import Document
    from app.models.message import Message
    from app.models.citation import Citation

    HISTORY_WINDOW = 10

    # 1. Fetch workspace and verify
    ws_result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = ws_result.scalars().first()
    if not workspace:
        yield f"data: {json.dumps({'type': 'error', 'code': 'WORKSPACE_NOT_FOUND', 'message': 'Workspace not found'})}\n\n"
        return

    # 2. Fetch member chats
    members_result = await db.execute(
        select(Chat)
        .join(WorkspaceChatModel, WorkspaceChatModel.chat_id == Chat.id)
        .where(WorkspaceChatModel.workspace_id == workspace_id)
    )
    member_chats = members_result.scalars().all()

    # 3. Collect active documents from member chats
    doc_ids = [c.current_doc_id for c in member_chats if c.current_doc_id is not None]
    chat_doc_map = {}
    for c in member_chats:
        if c.current_doc_id:
            chat_doc_map[str(c.current_doc_id)] = c.title

    active_docs = []
    if doc_ids:
        docs_result = await db.execute(select(Document).where(Document.id.in_(doc_ids)))
        documents = docs_result.scalars().all()
        now_utc = datetime.now(timezone.utc)
        for doc in documents:
            exp = doc.expiry_at
            if exp and exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if doc.status != "expired" and (exp is None or exp > now_utc):
                active_docs.append(doc)

    # 4. Parallel document retrieval via asyncio
    all_nodes = []
    if active_docs:
        async def _retrieve_doc(doc):
            try:
                import asyncio as _aio
                loop = _aio.get_event_loop()
                nodes = await loop.run_in_executor(
                    None, retrieve_context, workspace.user_id, doc.id, user_message, 5
                )
                for node in nodes:
                    node.node.metadata["document_id"] = str(doc.id)
                    node.node.metadata["file_name"] = doc.filename
                    node.node.metadata["source_chat"] = chat_doc_map.get(str(doc.id), "Unknown Chat")
                return nodes
            except ValueError as ve:
                if str(ve) == "NO_CONTENT_RETRIEVED":
                    return []
                return []
            except Exception:
                return []

        results = await asyncio.gather(*[_retrieve_doc(doc) for doc in active_docs])
        for node_list in results:
            all_nodes.extend(node_list)

    # Deduplicate and rank
    seen_texts = set()
    unique_nodes = []
    for node in all_nodes:
        text_content = node.node.text.strip()
        if text_content not in seen_texts:
            seen_texts.add(text_content)
            unique_nodes.append(node)
    unique_nodes.sort(key=lambda x: x.score or 0.0, reverse=True)
    top_nodes = unique_nodes[:8]

    # 5. Fetch recent chat history window (last 10 messages per chat)
    history_context = ""
    all_history_chats = list(member_chats)

    # Add workspace chat itself
    ws_chat_result = await db.execute(select(Chat).where(Chat.id == workspace_chat_id))
    ws_chat = ws_chat_result.scalars().first()
    if ws_chat:
        all_history_chats.append(ws_chat)

    for chat in all_history_chats:
        msgs_result = await db.execute(
            select(Message)
            .where(Message.chat_id == chat.id)
            .order_by(Message.created_at.desc())
            .limit(HISTORY_WINDOW)
        )
        recent_msgs = list(reversed(msgs_result.scalars().all()))
        if recent_msgs:
            label = "Workspace Chat" if chat.id == workspace_chat_id else chat.title
            history_context += f"\n[Chat: {label} — Recent History]\n"
            for msg in recent_msgs:
                role_label = "User" if msg.role == "user" else "Assistant"
                truncated = msg.content[:500] if len(msg.content) > 500 else msg.content
                history_context += f"{role_label}: {truncated}\n"

    # 6. Build workspace-aware prompt
    if not top_nodes and not history_context.strip():
        yield f"data: {json.dumps({'type': 'error', 'code': 'NO_CONTENT_RETRIEVED', 'message': 'No documents or history available in this workspace.'})}\n\n"
        return

    doc_context = ""
    for i, node in enumerate(top_nodes):
        metadata = node.node.metadata or {}
        page_num = metadata.get("page_label", metadata.get("page_num", "unknown"))
        file_name = metadata.get("file_name", "document")
        source_chat = metadata.get("source_chat", "Unknown")
        doc_context += f"--- Chunk {i+1} (Doc: {file_name} • Chat: {source_chat}, Page: {page_num}) ---\n"
        doc_context += node.node.text.strip() + "\n\n"

    system_prompt = (
        "You are Lexis Workspace Assistant — an expert cross-document retrieval assistant.\n\n"
        "You have access to multiple documents and conversation histories from this workspace.\n\n"
        "Core Response Guidelines:\n"
        "1. ADAPTIVE DEPTH: If the query is direct, answer concisely. If complex, provide detailed analysis.\n"
        "2. FORMATTING: Use clean Markdown. No robotic preamble.\n"
        "3. CROSS-DOCUMENT SYNTHESIS: When information spans multiple documents, synthesize and compare.\n"
        "4. CITATIONS: Attach inline `[Page X]` citations. When citing across documents, specify the source: `[Doc: filename.pdf, Page X]`.\n"
        "5. TRUTHFULNESS: Base answers ONLY on provided context. State clearly if information is not found.\n\n"
    )

    if doc_context.strip():
        system_prompt += f"Retrieved Document Context:\n{doc_context.strip()}\n\n"
    if history_context.strip():
        system_prompt += f"Relevant Conversation History:\n{history_context.strip()}\n\n"

    prompt = system_prompt + f"User Inquiry: {user_message}"

    # 7. Stream LLM tokens
    from app.rag.providers import stream_gemini, stream_groq, LLMUnavailableError
    from app.core.circuit_breaker import CircuitBreakerOpenException

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

    except CircuitBreakerOpenException as cbe:
        yield f"data: {json.dumps({'type': 'error', 'code': 'CIRCUIT_OPEN', 'message': cbe.message})}\n\n"
        return
    except LLMUnavailableError as err:
        yield f"data: {json.dumps({'type': 'error', 'code': 'PROVIDER_UNAVAILABLE', 'message': str(err)})}\n\n"
        return
    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'code': 'LLM_ERROR', 'message': str(exc)})}\n\n"
        return

    # 8. Extract citations with source attribution
    grouped_citations_data = []
    seen_page_keys = set()

    for node in top_nodes:
        metadata = node.node.metadata or {}
        doc_filename = metadata.get("file_name", "document")
        doc_id_str = metadata.get("document_id")
        source_chat = metadata.get("source_chat", "Unknown")
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
                "doc_filename": doc_filename,
                "source_chat": source_chat
            })

    # 9. Persist messages atomically
    try:
        from datetime import timedelta
        now_time = datetime.now(timezone.utc)
        user_msg = Message(
            id=uuid_mod.uuid4(),
            chat_id=workspace_chat_id,
            user_id=workspace.user_id,
            role="user",
            content=user_message,
            provider=None,
            doc_id=None,
            created_at=now_time - timedelta(milliseconds=50)
        )
        assistant_msg = Message(
            id=uuid_mod.uuid4(),
            chat_id=workspace_chat_id,
            user_id=workspace.user_id,
            role="assistant",
            content=full_response,
            provider=provider,
            doc_id=None,
            created_at=now_time
        )
        db.add(user_msg)
        db.add(assistant_msg)
        await db.flush()

        if grouped_citations_data:
            citation_values = [
                {
                    "id": uuid_mod.uuid4(),
                    "message_id": assistant_msg.id,
                    "document_id": uuid_mod.UUID(c_data["document_id"]),
                    "excerpt": c_data["excerpt"],
                    "page_number": c_data["page_number"]
                }
                for c_data in grouped_citations_data
            ]
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            BATCH_SIZE = 500
            for i in range(0, len(citation_values), BATCH_SIZE):
                chunk = citation_values[i:i + BATCH_SIZE]
                stmt = pg_insert(Citation).values(chunk)
                await db.execute(stmt)

        # Update workspace chat's last_provider
        if ws_chat:
            ws_chat.last_provider = provider

        await db.commit()
        try:
            from app.cache import cache
            await cache.delete_pattern(f"chat:{workspace_chat_id}:messages:*")
            await cache.delete(f"chat:{workspace_chat_id}:meta")
            await cache.delete_pattern(f"user:{workspace.user_id}:chats:*")
        except Exception:
            pass
    except asyncio.CancelledError:
        logger.info("SSE connection cancelled. Rolling back transaction.")
        await db.rollback()
        raise
    except Exception as db_exc:
        logger.error(f"Error persisting workspace conversation to database: {db_exc}")
        await db.rollback()
        raise

    # 10. Yield done event with citations
    done_payload = {
        'type': 'done',
        'citations': grouped_citations_data,
        'message_id': str(assistant_msg.id)
    }
    yield f"data: {json.dumps(done_payload)}\n\n"
