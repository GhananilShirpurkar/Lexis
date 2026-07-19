# Lexis — AI-Powered Document Intelligence Platform

![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black)
![LlamaIndex](https://img.shields.io/badge/LlamaIndex-RAG-7C3AED?style=flat)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-NeonDB-336791?style=flat&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Cache-DC382D?style=flat&logo=redis&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green?style=flat)
![Deploy](https://img.shields.io/badge/deploy-Render-46E3B7?style=flat&logo=render&logoColor=white)

---

## Overview

Lexis is a production-minded Retrieval-Augmented Generation (RAG) application that lets users upload documents and query them through a streaming conversational interface powered by Gemini and Groq. It combines a FastAPI backend with LlamaIndex-based vector retrieval, persistent chat history, and an optional Tavily web search layer — all surfaced through a responsive React dashboard. The system is architected with operational concerns front-and-center: circuit breakers, Redis caching, rate limiting, structured logging, and a standalone RAGAS evaluation pipeline are all first-class citizens.

---

## Architecture

The system is divided into three clearly separated layers:

- **Frontend** — React 18 + Vite + Tailwind CSS SPA. Communicates with the backend exclusively through a REST/SSE API. Handles optimistic UI updates, real-time streaming responses, and chat session management.
- **Backend** — Async FastAPI application. Owns authentication (JWT), document ingestion, the RAG pipeline, workspace/project management, and all database operations via SQLAlchemy + NeonDB (PostgreSQL).
- **RAG Pipeline** — LlamaIndex builds and persists per-document `VectorStoreIndex` instances. At query time, `retrieve_context()` loads the index, performs similarity search, and passes ranked chunks to the LLM provider. Tigris (S3-compatible) backs up index files for durability.

```mermaid
flowchart LR
    User(["👤 User"])
    FE["React Frontend\n(Vite + Tailwind)"]
    API["FastAPI Backend\n(Auth · Routers · Cache)"]
    RAG["RAG Pipeline\n(LlamaIndex · VectorStore)"]
    Web["Web Search\n(Tavily)"]
    LLM["LLM Provider\n(Gemini · Groq)"]
    DB[("NeonDB\n(PostgreSQL)")]
    Cache[("Redis\nCache")]
    Storage["Tigris\n(S3 · Index Backup)"]

    User -->|"Upload / Query"| FE
    FE -->|"REST + SSE"| API
    API -->|"JWT · Rate Limit"| API
    API <-->|"Read / Write"| DB
    API <-->|"Cache"| Cache
    API --> RAG
    RAG -->|"Similarity Search"| RAG
    RAG -->|"Fallback restore"| Storage
    RAG -.->|"Optional"| Web
    RAG --> LLM
    LLM -->|"Stream tokens"| API
    API -->|"SSE stream"| FE
    FE -->|"Render answer"| User
```

---

## Tech Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — async REST API framework
- [SQLAlchemy 2 (async)](https://docs.sqlalchemy.org/) + [Alembic](https://alembic.sqlalchemy.org/) — ORM and schema migrations
- [LlamaIndex](https://www.llamaindex.ai/) — document parsing, chunking (`SentenceSplitter`), and `VectorStoreIndex`
- [Google Gemini](https://ai.google.dev/) (`google-genai` SDK) — primary LLM provider
- [Groq](https://console.groq.com/) — fallback LLM provider (Llama 3.3, Mixtral)
- [Tavily](https://tavily.com/) — optional real-time web search augmentation
- [Redis](https://redis.io/) — response caching and session data
- [Loguru](https://loguru.readthedocs.io/) — structured JSON logging with per-request trace IDs via `contextvars`
- [Langfuse](https://langfuse.com/) — LLM observability and span tracing (optional)
- [APScheduler](https://apscheduler.readthedocs.io/) — background document expiry scanning

**Frontend**
- [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/)
- [Tailwind CSS 3](https://tailwindcss.com/) — utility-first styling
- [React Router 6](https://reactrouter.com/) — client-side routing
- [react-markdown](https://github.com/remarkjs/react-markdown) + `remark-gfm` + `rehype-highlight` — rich Markdown rendering with syntax highlighting
- [Axios](https://axios-http.com/) — HTTP client with interceptors

**Infrastructure**
- [NeonDB](https://neon.tech/) — serverless PostgreSQL
- [Tigris](https://www.tigrisdata.com/) — S3-compatible object storage (document files + index backups)
- [Render](https://render.com/) — backend deployment (`render.yaml` included)
- [Vercel](https://vercel.com/) — frontend deployment (`vercel.json` included)
- [uv](https://docs.astral.sh/uv/) — Python package and virtual environment manager

**Evaluation**
- [RAGAS](https://docs.ragas.io/) — RAG evaluation framework (`faithfulness`, `answer_relevancy`, `context_precision`, `context_recall`)
- [Pandas](https://pandas.pydata.org/) + [HuggingFace Datasets](https://huggingface.co/docs/datasets) — results processing and export

---

## Features

| Feature | Description |
|---|---|
| **Document RAG** | Upload PDFs and text files; LlamaIndex chunks and indexes them locally using `SentenceSplitter` + `VectorStoreIndex`. Supports per-user, per-document isolated indexes. |
| **Streaming LLM Responses** | Answers stream token-by-token to the frontend via Server-Sent Events. Supports Gemini 2.5 Flash and Groq Llama 3.3 with automatic model fallback. |
| **Hybrid Query Modes** | Document-only RAG, web-augmented RAG (Tavily), and pure-LLM modes in a single interface. |
| **Projects & Workspaces** | Group multiple document chats into Projects (unified RAG across all docs) or Workspaces (cross-document synthesis with shared chat history). |
| **Inline Citations** | Every LLM response includes page-level `[Page X]` citations linked back to source chunks. A collapsible citation panel shows verbatim excerpts. |
| **AI Document Summaries** | On upload, an LLM-generated summary and refined title are streamed back via SSE and displayed in a Document Overview card. |
| **Circuit Breakers** | Independent `CLOSED → OPEN → HALF-OPEN` breakers for the LLM provider, Tavily, and Tigris storage — exposed on the `/health` endpoint. |
| **Redis Response Cache** | Chat lists, workspace metadata, and public endpoints are cached in Redis with TTL-aware invalidation on mutation. |
| **Rate Limiting** | Independent IP-based and email-based sliding-window rate limiters on the login endpoint. |
| **Document Expiry** | Documents have a configurable TTL. A background APScheduler job runs every 12 hours, expires stale documents, removes index files, and sends 48-hour warning notifications. |
| **Structured Logging** | Loguru emits JSON logs to stdout. Every request gets a UUID `request_id` injected via `contextvars` and forwarded as an `X-Request-ID` response header. |
| **LLM Observability** | `retrieve_context()`, `stream_gemini()`, and `stream_groq()` are wrapped with `@observe()` Langfuse decorators. The `request_id` is injected into each trace for log-to-trace correlation. |
| **Optimistic UI** | Chat deletion, renaming, and notification dismissal update the UI instantly and roll back gracefully on API error. |
| **RAG Evaluation Pipeline** | Standalone `evaluate.py` script runs the live pipeline against a golden JSONL dataset and scores it with RAGAS — no server required. |

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.11 | Pinned in `backend/.python-version` |
| Node.js | 18+ | For the React frontend |
| uv | Latest | `pip install uv` — manages the Python venv |
| PostgreSQL | 14+ | NeonDB recommended for hosted deployments |
| Redis | 6+ | Local or Upstash for hosted deployments |

---

## Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/lexis.git
cd lexis
```

### 2. Backend — Python environment

```bash
cd backend

# Create virtual environment and install all dependencies
uv venv
uv pip install -r requirements.txt

# Or install directly from pyproject.toml (including dev extras)
uv pip install -e ".[dev]"
```

### 3. Backend — Environment variables

Copy the example below into `backend/.env` and fill in your values.

```dotenv
# ── Database ──────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/lexis

# ── Cache ─────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── Authentication ────────────────────────────────────────
JWT_SECRET=your-secret-key-here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# ── LLM Providers (at least one required) ─────────────────
GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key

# ── Object Storage (Tigris / S3-compatible) ───────────────
S3_BUCKET_NAME=lexis
ENDPOINT_URL_S3=https://fly.storage.tigris.dev
TIGRIS_ACCESS_KEY_ID=your-access-key
TIGRIS_SECRET_KEY=your-secret-key

# ── Optional: Web Search ──────────────────────────────────
TAVILY_API_KEY=your-tavily-api-key

# ── Optional: Observability ───────────────────────────────
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com

# ── CORS (production) ─────────────────────────────────────
CORS_ORIGINS=https://your-frontend-domain.vercel.app

# ── Local dev flags ───────────────────────────────────────
FORCE_MOCK_LLM=false
FORCE_MOCK_S3=false
STORAGE_INDICES_DIR=storage/indices
```

> **Minimum viable config:** `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and at least one of `GEMINI_API_KEY` or `GROQ_API_KEY`. Everything else degrades gracefully.

### 4. Backend — Database migrations

```bash
# From the backend/ directory, with the venv active:
alembic upgrade head
```

### 5. Frontend — Node dependencies

```bash
cd ../frontend
npm install
```

### 6. Frontend — Environment variables

Create `frontend/.env.local`:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
```

---

## Running the App

### Backend

```bash
# From the backend/ directory, with the venv active:
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Frontend

```bash
# From the frontend/ directory:
npm run dev
```

The React app will be available at `http://localhost:5173`.

### RAG Evaluation (optional, standalone)

```bash
# From the project root, with the venv active:
# 1. Add your test Q&A pairs to evaluation/golden_dataset.jsonl
# 2. Run the evaluation
EVAL_PROVIDER=gemini RAGAS_LLM=gemini python evaluate.py

# Results summary is printed to console.
# Per-question scores saved to evaluation/eval_results.csv
```

---

## Project Structure

```
lexis/
├── backend/
│   ├── app/
│   │   ├── auth/           # JWT, middleware, rate limiting, ownership checks
│   │   ├── core/           # Circuit breakers, Redis caching, observability
│   │   ├── db/             # SQLAlchemy session, base, index creation
│   │   ├── middleware/      # Logging (request_id), GZip compression
│   │   ├── models/         # ORM models: User, Chat, Document, Message, Workspace…
│   │   ├── rag/            # pipeline.py, providers.py, web_search.py
│   │   ├── routers/        # FastAPI routers: auth, chats, documents, workspaces…
│   │   ├── schemas/        # Pydantic request/response schemas
│   │   ├── storage/        # Tigris/S3 client
│   │   ├── config.py       # Pydantic Settings — all env vars in one place
│   │   └── main.py         # App factory, middleware stack, startup/shutdown hooks
│   ├── migrations/         # Alembic migration scripts
│   ├── pyproject.toml
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/            # Axios client
│   │   ├── components/     # Shared UI components
│   │   ├── context/        # Auth, Theme, Toast providers
│   │   ├── pages/          # Dashboard, Library, Profile, Billing, Onboarding…
│   │   └── utils/          # Optimistic update helper
│   ├── package.json
│   └── vite.config.js
├── evaluation/
│   ├── golden_dataset.jsonl          # Test Q&A pairs
│   └── generate_dataset_template.py  # Dataset expansion tool
├── evaluate.py             # Standalone RAGAS evaluation script
├── render.yaml             # Render.com deployment config
└── README.md
```

---

## Next Steps

Lexis is a functional MVP with production infrastructure in place. Planned upgrades:

- **RAGAS Baseline & Regression Testing** — Run the evaluation pipeline on a curated golden dataset, establish metric baselines (`faithfulness`, `context_recall`, etc.), and gate future RAG changes against regressions in CI.
- **Semantic Caching** — Cache LLM responses by query embedding similarity (e.g. via Redis + pgvector) to avoid redundant LLM calls for semantically equivalent questions.
- **Hybrid Search** — Combine dense vector retrieval (current) with BM25 sparse retrieval and re-rank results with a cross-encoder for improved recall on keyword-heavy queries.
- **Agentic Query Routing** — Add a lightweight router that classifies queries and decides whether to hit the local index, trigger web search, or escalate to a more capable model.
- **Multi-modal Support** — Extend document ingestion to handle images and tables extracted from PDFs.
- **Usage Analytics Dashboard** — Surface token consumption, cache hit rates, and circuit breaker trip history in the Dev Console.
