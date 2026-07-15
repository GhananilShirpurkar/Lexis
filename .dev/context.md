# Lexis Implementation Context & State Log

This file serves as a persistent context log for the Lexis RAG system implementation. It tracks the exact state of the codebase, completed tasks from `task_agent_mapping.md`, structural and architectural decisions, and references for future agent sessions.

---

## 📊 Current High-Level State

*   **Last Updated**: 2026-07-14
*   **Current Wave**: Wave 10 (Checkpoint — Full Backend Passes)
*   **Current Task**: 10.1.1: Run all backend tests
*   **Active Directory Layout**:
    *   Root contains: `pyproject.toml`, `main.py`, `README.md`
    *   `backend/` contains: `.python-version`, `pyproject.toml`, `alembic.ini`, `README.md`, `app/`, `migrations/`, `tests/`
    *   `frontend/` contains: `package.json`, `package-lock.json`, `vite.config.js`, `index.html`, `.gitignore`, `src/`
    *   `.dev/` contains: `INDEX.md`, `requirements.md`, `tasks.md`, `task_agent_mapping.md`, `context.md`

---

## 🛠️ Architectural & System Decisions 

*   **Backend Isolation**: Nested backend application under `backend/` directory for clean separation.
*   **DB Migration**: Alembic configured for handling PostgreSQL migrations.
*   **Database URL & Query Sanitization**: Programmatically strip all query parameters (e.g. `channel_binding=require`, `sslmode=require`) from the connection URL to prevent `asyncpg` keyword argument crashes, while dynamically injecting `ssl=True` in the engine `connect_args`.
*   **Direct Bcrypt Hashing**: Bypassed `passlib` context wrappers due to compatibility bugs with modern `bcrypt` versions (e.g., `AttributeError: module 'bcrypt' has no attribute '__about__'`) and transitioned to direct `bcrypt` hashing/verification with a default salt factor of 12.
*   **Startup Schema Alignment**: Configured a connection-safe database setup hook in `main.py` that verifies schema completeness and automatically builds missing tables without transaction abortion conflicts.
*   **Storage Integration**: Transitioned storage layer from Cloudflare R2 to Tigris S3 storage. Refactored the settings and the S3 client wrapper in `r2_client.py` to seamlessly connect to the Tigris custom endpoint while maintaining backward compatibility with standard boto3 signatures.
*   **LLM Provider Mocking**: Offline mock provider first for testing, then live integration.

---

## ⏱️ Completed Tasks Log

| Task ID | Wave | Description | Completed At | Agent | Key Code Modifications / Outputs |
|---------|------|-------------|--------------|-------|----------------------------------|
| **11.7.1** | Wave 11 | Implement premium research RAG workspace dashboard | 2026-07-14 | `frontend-specialist` | Created `frontend/src/pages/Dashboard.jsx` featuring active chat creation/deletion/renaming, drag-drop document upload, SSE-based live answer streaming, unread notification alerts, and context panels. |
| **11.6.1** | Wave 11 | Wire React routing mapping and endpoints | 2026-07-14 | `frontend-specialist` | Integrated `react-router-dom` in `App.jsx` to route public `/auth`, protected `/`, and `/dev-console`. |
| **11.5.1** | Wave 11 | Conform CSS layouts with design specification | 2026-07-14 | `frontend-specialist` | Refactored `index.css` incorporating the collapsible sidebar, notification dropdown, document upload zone, live message streaming cursors, and custom card shapes. |
| **11.4.1** | Wave 11 | Implement ProtectedRoute routing wrapper | 2026-07-14 | `frontend-specialist` | Created `frontend/src/components/ProtectedRoute.jsx` verifying user session presence with skeleton loading transitions. |
| **11.3.1** | Wave 11 | Create AuthPage authentication page | 2026-07-14 | `frontend-specialist` | Created `frontend/src/pages/AuthPage.jsx` with input validations, login/register tabs, and server-side warning alerts. |
| **11.2.1** | Wave 11 | Create AuthContext authentication state provider | 2026-07-14 | `frontend-specialist` | Created `frontend/src/context/AuthContext.jsx` handling user authentication status, session local persistence, and global sign-out triggers. |
| **11.1.1** | Wave 11 | Setup apiClient Axios client infrastructure | 2026-07-14 | `frontend-specialist` | Created `frontend/src/api/client.js` with auto-injecting JWT headers and 401 unauth interceptors. |
| **9.3.1** | Wave 9 | Create notification fetch and modification API endpoints | 2026-07-14 | `backend-specialist` | Added `GET /notifications` and `PATCH /notifications/{notif_id}` in `backend/app/routers/notifications.py`, registered router in `main.py`, wrote unit tests in `test_notifications.py`. |
| **9.2.1** | Wave 9 | Write property tests for expiry service behavior | 2026-07-14 | `test-engineer` | Added unit and property tests verifying warning notice triggers under 48h and re-upload reset logic in `test_expiry.py`. |
| **9.1.4** | Wave 9 | Register scheduler background tasks | 2026-07-14 | `devops-engineer` | Integrated APScheduler in `main.py` to trigger the background expiry scan job at 12-hour intervals on server startup. |
| **9.1.3** | Wave 9 | Build expiry warning notice generator | 2026-07-14 | `devops-engineer` | Added `check_expiry_warnings` scanning for documents expiring in under 48h and spawning unread in-app alerts in `expiry/service.py`. |
| **9.1.2** | Wave 9 | Implement file and index deletion routines | 2026-07-14 | `devops-engineer` | Added file and vector index physical deletion routines on document expiration in `expiry/service.py`. |
| **9.1.1** | Wave 9 | Build expired document db queries | 2026-07-14 | `devops-engineer` | Implemented `check_document_expirations` scanning database for expired documents in `expiry/service.py`. |
| **8.2.1** | Wave 8 | Write property tests verifying multi-tenant isolation | 2026-07-14 | `test-engineer` | Added Hypothesis tests checking `assert_owns` validation with mismatched user IDs in `test_authorization.py`. |
| **8.1.1** | Wave 8 | Build centralized ownership validation handler | 2026-07-14 | `security-auditor` | Implemented `assert_owns(user_id, resource, db)` in `backend/app/auth/ownership.py` returning HTTP 403 on tenant violations and HTTP 404 on missing records. |
| **7.4.1** | Wave 7 | Wire Unified_Chat message endpoint to unified query | 2026-07-14 | `backend-specialist` | Routed SSE message submission endpoint to `query_unified` cross-document RAG pipeline if the chat is unified. |
| **7.3.1** | Wave 7 | Write property test verifying project limits (Property 19) | 2026-07-14 | `test-engineer` | Added test verifying project creation is blocked when user hits 10 projects. |
| **7.2.1** | Wave 7 | Write property tests verifying project boundaries (Property 18) | 2026-07-14 | `test-engineer` | Added property tests verifying maximum of 4 chats and 4 unique docs constraint. |
| **7.1.4** | Wave 7 | Create Project chat membership management APIs | 2026-07-14 | `backend-specialist` | Added project chat add/remove endpoints with capacity validations. |
| **7.1.3** | Wave 7 | Create Project rename and delete API endpoints | 2026-07-14 | `backend-specialist` | Added rename and cascading deletion logic. |
| **7.1.2** | Wave 7 | Create Project list and details API endpoints | 2026-07-14 | `backend-specialist` | Added listing and details fetching endpoints. |
| **7.1.1** | Wave 7 | Create Project creation API endpoint | 2026-07-14 | `backend-specialist` | Created `POST /projects` endpoint creating project and Unified Chat record. |
| **6.1-6.10**| Wave 6 | Cross-document context retrieval & SSE streaming | 2026-07-14 | `backend-specialist` | Implemented cross-document context retriever, LLM prompt builder, providers module, connection retry decorator, SSE formatting pipeline, done event with citation deduplication, and atomic DB logger in `backend/app/rag/pipeline.py`. Wrote unit tests in `test_unified_query.py` and `test_citations.py`. |
| **5.5.1** | Wave 5 | Create message history retrieval API endpoint | 2026-07-14 | `backend-specialist` | Added `GET /chats/{chat_id}/messages` to `backend/app/routers/chats.py` with ownership validation and selectinload message citations. Wrote unit tests in `test_chat_management.py`. |
| **5.4.1** | Wave 5 | Write property test verifying resources limits (Property 19) | 2026-07-14 | `test-engineer` | Added Hypothesis test asserting 40 active chats limit. |
| **5.3.1** | Wave 5 | Write property test verifying fallback provider (Property 14) | 2026-07-14 | `test-engineer` | Added Hypothesis test asserting provider fallback to gemini or last_provider. |
| **5.2.1** | Wave 5 | Write property tests validating display naming ranges (Properties 8, 9, 23) | 2026-07-14 | `test-engineer` | Added Hypothesis tests checking display name lengths, truncation, and original_name preservation. |
| **5.1.4** | Wave 5 | Create Chat deletion API endpoint | 2026-07-14 | `backend-specialist` | Added `DELETE /chats/{chat_id}` with cascade deletes and conditional hard-deletion of orphaned documents from storage and local index. |
| **5.1.3** | Wave 5 | Create Chat rename API endpoint | 2026-07-14 | `backend-specialist` | Added `PATCH /chats/{chat_id}` with 1-60 characters limits and original_name preservation logic. |
| **5.1.2** | Wave 5 | Create Chat retrieval list APIs | 2026-07-14 | `backend-specialist` | Added `GET /chats` and `GET /chats/{chat_id}` with ownership validation. |
| **5.1.1** | Wave 5 | Create Chat creation API endpoint | 2026-07-14 | `backend-specialist` | Added `POST /chats enforcing the 40 active chats limit per user. |
| **4.1.1** | Wave 4 | Run and pass all unit tests | 2026-07-14 | `test-engineer` | Executed full unit test suite; resolved pytest DB startup crash and aligned email validation regex tests. |
| **3.11.2** | Wave 3 | Create document deletion API endpoint | 2026-07-14 | `backend-specialist` | Added `DELETE /documents/{doc_id}` to `backend/app/routers/documents.py` verifying ownership and returning `404 Not Found` to prevent information leaks. The route hard-deletes the document, triggers cascade deletes, cleans up S3 storage, and removes local RAG vector indices. Wrote unit tests in `test_documents_router.py`. |
| **3.11.1** | Wave 3 | Create document retrieval API endpoint | 2026-07-14 | `backend-specialist` | Added `GET /documents/{doc_id}` to `backend/app/routers/documents.py` validating ownership and returning `404 Not Found` for invalid access/non-existent documents. Wrote unit tests in `test_documents_router.py`. |
| **3.10.1** | Wave 3 | Write property test checking date expirations (Property 6) | 2026-07-14 | `test-engineer` | Added a Hypothesis property test `test_property_calculate_expiry_is_seven_days_later` inside `backend/tests/unit/test_document_validation.py` asserting date expiry logic under timezone-aware (UTC) and naive configurations. Integrated custom `calculate_expiry` function into `routers/documents.py`. |
| **3.9.2** | Wave 3 | Implement atomic database upload transactions | 2026-07-14 | `backend-specialist` | Implemented database transactions combining upload records insertion and updating associated `chat.current_doc_id` inside the upload endpoint. Handled chat title auto-derivation matching Requirement 8.3 and robust S3 and local vector index cleanup on transaction failures. |
| **3.9.1** | Wave 3 | Build file upload router mappings | 2026-07-14 | `backend-specialist` | Created `backend/app/routers/documents.py` defining the protected `POST /documents/upload` route, supporting multipart file payload and optional chat_id, and executing validation, R2 upload, and vector indexing. Registered router in `main.py` and wrote unit tests in `test_documents_router.py`. |
| **3.8.1** | Wave 3 | Write property test verifying summary limits (Property 13) | 2026-07-05 | `test-engineer` | Added 3 Hypothesis property tests to `backend/tests/unit/test_rag_pipeline.py`: (A) mocked Gemini returns a string ≤5000 chars and ≤150 words, (B) both providers failing yields `""`, (C) no API keys yields `""`. Fixed `MockEmbedding` import path in `pipeline.py` (`llama_index.core.embeddings`). Added `deadline=None, suppress_health_check` to Property 22 to prevent timeout on slow LlamaIndex I/O. All 4 tests pass in 15s. |
| **3.7.2** | Wave 3 | Write generation error fallback logic | 2026-07-04 | `backend-specialist` | Implemented try-except error handling inside `generate_summary` that cascades from Gemini to Groq, and gracefully defaults to an empty string on ultimate failure. Truncated inputs to 10,000 characters. |
| **3.7.1** | Wave 3 | Write summary generation LLM provider prompts | 2026-07-04 | `backend-specialist` | Implemented `generate_summary` function in `backend/app/rag/pipeline.py` with custom text-only prompt requesting cohesive paragraphs (<=150 words, <=5000 chars) describing the document's content. |
| **3.6.1** | Wave 3 | Write property test verifying document parser states | 2026-07-04 | `test-engineer` | Created `backend/tests/unit/test_rag_pipeline.py` containing Hypothesis property-based tests verifying that empty or whitespace-only documents always throw `ValueError("EMPTY_DOCUMENT")` during index parsing. |
| **3.5.3** | Wave 3 | Implement indexing failure rollbacks | 2026-07-02 | `backend-specialist` | Added exception handlers in `backend/app/rag/pipeline.py` that catch indexing failures, invoke `delete_file` to remove the uploaded file from Tigris/S3 storage, clean up partial local index persistent directories, and propagate the original exception. Added `test_index_document_failure_rollback` test verifying correct cleanup behavior. |
| **3.5.2** | Wave 3 | Implement LlamaIndex vector store compilation | 2026-07-02 | `backend-specialist` | Updated `backend/app/rag/pipeline.py` to chunk documents with `SentenceSplitter` and serialize compiled indices to local directory `STORAGE_INDICES_DIR/{user_id}/{doc_id}`. Added `STORAGE_INDICES_DIR` to `Settings`. Updated `test_pipeline.py` to assert disk serialization and override behavior. |
| **3.5.1** | Wave 3 | Integrate document loaders and text extraction | 2026-06-29 | `backend-specialist` | Created `backend/app/rag/pipeline.py` implementing `index_document` with LlamaIndex file loading, chunking, and index build. Rejects empty/whitespace documents with `ValueError("EMPTY_DOCUMENT")`. |
| **3.4.1** | Wave 3 | Write property test verifying namespace prefixing (Property 17) | 2026-06-29 | `test-engineer` | Created `backend/tests/unit/test_authorization.py` containing Hypothesis property tests verifying R2 storage key user prefixing and complete namespace isolation between different users. |
| **3.3.2** | Wave 3 | Implement file upload and delete methods | 2026-06-29 | `backend-specialist` | Implemented `upload_file` and `delete_file` methods with object keys matching user prefix formatting `{user_id}/{doc_id}/{filename}` in `backend/app/storage/r2_client.py`. |
| **3.3.1** | Wave 3 | Configure boto3 S3 client connection mappings | 2026-06-29 | `backend-specialist` | Created `backend/app/storage/r2_client.py` initializing boto3 S3 client with s3v4 signature configuration, custom endpoint URL mappings, and fallback mock support. |
| **3.2.1** | Wave 3 | Write property tests for file boundaries (Property 7) | 2026-06-29 | `test-engineer` | Added Hypothesis property-based testing suites for whitelisted/unsupported formats and size boundaries in `test_document_validation.py`. |
| **N/A** | Wave 3 | Stabilize database connections, URL parameters, and password hashing | 2026-06-29 | `debugger` | Stripped query parameters from connection URL, bypassed passlib for direct bcrypt, and added separate startup transaction blocks for schema alignment. |
| **3.1.2** | Wave 3 | Write file size limits verification checks | 2026-06-27 | `backend-specialist` | Extended `backend/app/documents/validation.py` to validate sizes between 1B and 50MB using headers and actual read sizes. |
| **3.1.1** | Wave 3 | Write file extension and mime type validation filters | 2026-06-27 | `backend-specialist` | Created `backend/app/documents/validation.py` verifying file formats and MIME types against allowed whitelist. |
| **2.7.2** | Wave 2 | Wire login rate limiter with authentication router | 2026-06-27 | `backend-specialist` | Integrated rate limit dependency into POST /auth/login and cleared email history on successful auth. |
| **2.7.1** | Wave 2 | Write dynamic sliding-window rate limit service | 2026-06-27 | `security-auditor` | Implemented abstract rate limiter class and in-memory cache storage tracking independent IP and email attempt thresholds. |
| **2.6.2** | Wave 2 | Create User Login API endpoint | 2026-06-27 | `backend-specialist` | Created POST /auth/login with credentials validation and JWT token issuance. |
| **2.6.1** | Wave 2 | Create User Registration API endpoint | 2026-06-27 | `backend-specialist` | Created POST /auth/register validating email, duplicate checks, password hashing, and JWT token issuance. Enforced 72-char password max. |
| **2.5.2** | Wave 2 | Apply authorization middleware exclusions | 2026-06-23 | `security-auditor` | Registered `JWTMiddleware` to FastAPI in `backend/app/main.py`. |
| **2.5.1** | Wave 2 | Create authorization Bearer parsing middleware | 2026-06-23 | `security-auditor` | Created `backend/app/auth/middleware.py` parsing headers and attaching user identities. |
| **2.4.2** | Wave 2 | Write property tests for token error scenarios (Property 5) | 2026-06-23 | `test-engineer` | Added Hypothesis test verifying invalid token decodes return None. |
| **2.4.1** | Wave 2 | Write property tests for token expiration calculations (Property 3) | 2026-06-23 | `test-engineer` | Added Hypothesis tests checking token lifecycle, encoding, and past-expired token checks. |
| **2.3.2** | Wave 2 | Write token decoding and signature validation | 2026-06-23 | `security-auditor` | Created `decode_token` in `backend/app/auth/jwt.py`. |
| **2.3.1** | Wave 2 | Write access token generation method | 2026-06-23 | `security-auditor` | Created `create_access_token` with 24 hours default expiry inside `backend/app/auth/jwt.py`. |
| **2.2.3** | Wave 2 | Write property tests for registration length checks (Property 4) | 2026-06-23 | `test-engineer` | Created `backend/tests/unit/test_auth_service.py` verifying password lower bound. |
| **2.2.2** | Wave 2 | Write property tests for password hashing cost factors (Property 2) | 2026-06-23 | `test-engineer` | Added Hypothesis tests checking cost factor (rounds >= 10) and mismatch verification. |
| **2.2.1** | Wave 2 | Write property tests for email formats (Property 1) | 2026-06-23 | `test-engineer` | Added Hypothesis tests checking email pattern limits and oversize inputs. |
| **2.1.2** | Wave 2 | Implement email format validator | 2026-06-23 | `security-auditor` | Created `validate_email_format` check inside `backend/app/auth/utils.py`. |
| **2.1.1** | Wave 2 | Implement bcrypt password hashing functions | 2026-06-23 | `security-auditor` | Created `hash_password` and `verify_password` wrappers in `backend/app/auth/utils.py`. |
| **1.7.2** | Wave 1 | Create FastAPI main entrypoint and CORS configurations | 2026-06-23 | `backend-specialist` | Created `backend/app/main.py` initializing FastAPI and registering CORSMiddleware for frontend endpoints. |
| **1.6.5** | Wave 1 | Establish standard API error response envelope | 2026-06-23 | `backend-specialist` | Created `backend/app/schemas/error.py` defining standardized error response format. |
| **1.7.1** | Wave 1 | Write environment configuration management | 2026-06-23 | `security-auditor` | Created `backend/app/core/security.py` using Passlib (Bcrypt) and Python-Jose (HS256) with 30 minutes token expiration defaults. Added ACCESS_TOKEN_EXPIRE_MINUTES configuration to `backend/app/config.py`. |
| **1.6.4** | Wave 1 | Define Project and Notification Pydantic schemas | 2026-06-23 | `backend-specialist` | Created `backend/app/schemas/project.py` and `backend/app/schemas/notification.py` modeling workspace entries and unread/read alert schemas. |
| **1.6.3** | Wave 1 | Define Chat, Message, and Citation Pydantic schemas | 2026-06-23 | `backend-specialist` | Created `backend/app/schemas/chat.py` defining chat requests, nested message response timelines, and nested citation snippets. |
| **1.6.2** | Wave 1 | Define Document Pydantic schemas | 2026-06-23 | `backend-specialist` | Created `backend/app/schemas/document.py` modeling file sizes, statuses, and metadata payloads. |
| **1.6.1** | Wave 1 | Define User Pydantic schemas | 2026-06-23 | `backend-specialist` | Created `backend/app/schemas/user.py` defining sign-up inputs and JWT token structures. Added `email-validator` dependency. |
| **1.5.6** | Wave 1 | Implement Notification SQLAlchemy model | 2026-06-23 | `database-architect` | Created `backend/app/models/notification.py` mapping unread/read alerts and foreign key to User. Restructured `backend/app/db/base.py` and `env.py` for metadata imports. |
| **1.5.5** | Wave 1 | Implement Project and ProjectChat SQLAlchemy models | 2026-06-23 | `database-architect` | Created `backend/app/models/project.py` mapping workspace tables, junction join constraints, and cascading rules. |
| **1.5.4** | Wave 1 | Implement Citation SQLAlchemy model | 2026-06-23 | `database-architect` | Created `backend/app/models/citation.py` with excerpt and page number definitions, and cascade deleted references. |
| **1.5.3** | Wave 1 | Implement Chat and Message SQLAlchemy models | 2026-06-23 | `database-architect` | Created `backend/app/models/chat.py` and `backend/app/models/message.py` with cross-referenced relationships and foreign keys. |
| **1.5.2** | Wave 1 | Implement Document SQLAlchemy model | 2026-06-23 | `database-architect` | Created base model class `backend/app/db/base.py` and `backend/app/models/document.py` mapping Document fields, foreign keys, and indexes (including compound index on expiry/status). |
| **1.5.1** | Wave 1 | Implement User SQLAlchemy model | 2026-06-23 | `database-architect` | Created base model class `backend/app/db/base.py` and `backend/app/models/user.py` mapping email, hashed password, and relationships. |
| **1.4.3** | Wave 1 | Create FastAPI database dependency provider | 2026-06-23 | `database-architect` | Created database dependency `get_db()` inside `backend/app/db/session.py` with automatic exception rollback. |
| **1.4.2** | Wave 1 | Implement SQLAlchemy session lifecycle factory | 2026-06-23 | `database-architect` | Added `AsyncSessionLocal` sessionmaker configuration to `backend/app/db/session.py`. |
| **1.4.1** | Wave 1 | Establish SQLAlchemy database engine connection configurations | 2026-06-23 | `database-architect` | Created config parsing module `backend/app/config.py` and initialized the async database engine with pool sizing in `backend/app/db/session.py`. |
| **1.3.2** | Wave 1 | Write migration DDL schema definitions | 2026-06-23 | `database-architect` | Created Alembic initial migration version script `backend/migrations/versions/001_initial.py` defining schemas for `users`, `documents`, `chats`, `messages`, `citations`, `projects`, `project_chats`, and `notifications`. |
| **1.3.1** | Wave 1 | Initialize schema migration directories | 2026-06-23 | `database-architect` | Initialized Alembic setup with `backend/alembic.ini`, `backend/migrations/env.py`, `backend/migrations/script.py.mako`, and `backend/migrations/versions/.gitkeep`. |
| **1.2.3** | Wave 1 | Configure Vite proxy rule settings | 2026-06-23 | `frontend-specialist` | Added proxy to `frontend/vite.config.js` mapping `/api` to backend `http://localhost:8000` with rewrite. |
| **1.2.2** | Wave 1 | Install frontend package dependencies | 2026-06-23 | `frontend-specialist` | Added `axios` and `react-router-dom` to `frontend/package.json` dependencies. |
| **1.2.1** | Wave 1 | Scaffold React application with Vite | 2026-06-23 | `project-planner` | Scaffolded `frontend/` containing `package.json`, `vite.config.js`, `index.html`, `.gitignore`, and `src/` with a high-fidelity carbon theme and typography configuration. |
| **1.1.2** | Wave 1 | Configure Python project configuration and package dependencies | 2026-06-23 | `project-planner` | Created `backend/pyproject.toml` containing FastAPI, SQLAlchemy, LlamaIndex, etc., and `backend/README.md`. |
| **1.1.1** | Wave 1 | Create backend root directory and configuration stubs | 2026-06-23 | `project-planner` | Created `backend/` folder, `.python-version` (3.11), and empty `backend/app/__init__.py`. |

---

## 💾 Agent Context Matrix (Internal State Data)

```json
{
  "project_name": "Lexis",
  "status": "groundwork_initialized",
  "environment": {
    "target_python_version": "3.11",
    "frameworks": {
      "backend": "FastAPI",
      "frontend": "React (Vite)"
    }
  },
  "completed_subtasks": [
    "1.1.1",
    "1.1.2",
    "1.2.1",
    "1.2.2",
    "1.2.3",
    "1.3.1",
    "1.3.2",
    "1.4.1",
    "1.4.2",
    "1.4.3",
    "1.5.1",
    "1.5.2",
    "1.5.3",
    "1.5.4",
    "1.5.5",
    "1.5.6",
    "1.6.1",
    "1.6.2",
    "1.6.3",
    "1.6.4",
    "1.7.1",
    "1.6.5",
    "1.7.2",
    "2.1.1",
    "2.1.2",
    "2.2.1",
    "2.2.2",
    "2.2.3",
    "2.3.1",
    "2.3.2",
    "2.4.1",
    "2.4.2",
    "2.5.1",
    "2.5.2",
    "2.6.1",
    "2.6.2",
    "2.7.1",
    "2.7.2",
    "3.1.1",
    "3.1.2",
    "3.2.1",
    "3.3.1",
    "3.3.2",
    "3.4.1",
    "3.5.1",
    "3.5.2",
    "3.5.3",
    "3.6.1",
    "3.7.1",
    "3.7.2",
    "3.8.1",
    "3.9.1",
    "3.9.2",
    "3.10.1",
    "3.11.1",
    "3.11.2",
    "4.1.1",
    "5.1.1",
    "5.1.2",
    "5.1.3",
    "5.1.4",
    "5.2.1",
    "5.3.1",
    "5.4.1",
    "5.5.1",
    "6.1.1",
    "6.1.2",
    "6.1.3",
    "6.2.1",
    "6.3.1",
    "6.4.1",
    "6.5.1",
    "6.5.2",
    "6.6.1",
    "6.7.1",
    "6.8.1",
    "6.9.1",
    "6.10.1",
    "6.10.2",
    "7.1.1",
    "7.1.2",
    "7.1.3",
    "7.1.4",
    "7.2.1",
    "7.3.1",
    "7.4.1",
    "8.1.1",
    "8.2.1",
    "9.1.1",
    "9.1.2",
    "9.1.3",
    "9.1.4",
    "9.2.1",
    "9.3.1"
  ],
  "pending_immediate_tasks": [
    "10.1.1"
  ]
}
```
