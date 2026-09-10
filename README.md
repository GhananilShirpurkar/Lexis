<div align="center">

<img src="frontend/public/brand/lexis-mark.svg" width="96" height="96" alt="Lexis Logo" />

# L E X I S

### Enterprise AI Document Intelligence & Retrieval-Augmented Generation Platform

*Turn complex document corpora into verifiable, cited intelligence with sub-second vector search, adaptive dual-engine streaming, and zero-hallucination provenance.*

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![LlamaIndex](https://img.shields.io/badge/LlamaIndex-Vector%20Index-FF7A17?style=flat-square)](https://llamaindex.ai)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-NeonDB-336791?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech)
[![Redis](https://img.shields.io/badge/Redis-Cache-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[**Explore Product**](#-product-capabilities) • [**Architecture**](#-architecture) • [**Quickstart**](#-quickstart-in-3-minutes) • [**API Reference**](#-rest--streaming-api) • [**Evaluation Benchmarks**](#-rag-evaluation--benchmarks) • [**Deployment**](#-production-deployment)

</div>

---

## ⚡ Executive Summary

**Lexis** is a production-grade **AI Document Intelligence and Retrieval-Augmented Generation (RAG) platform** engineered for technical researchers, enterprise teams, and knowledge-intensive organizations. 

Unlike brittle prototype wrappers, Lexis treats document Q&A as a distributed systems challenge: it combines **LlamaIndex vector embeddings**, **dual-model LLM streaming (Google Gemini + Groq Llama 3)**, **distributed circuit breakers**, **verifiable page-exact citations**, and **isolated multi-tenant workspaces** behind a high-precision, low-latency interface.

### Why Lexis?

| Capability | Standard / Naive RAG | **Lexis Enterprise Platform** |
|---|---|---|
| **Citation Grounding** | Vague hallucinations; unverified text quotes | Exact `[Page X]` token-level citations linked to verifiable excerpts |
| **Model Availability** | Single-provider failure halts operations | Autonomous hot-fallback (**Gemini 1.5 Flash** $\leftrightarrow$ **Groq Llama 3.3**) |
| **Data Durability** | Ephemeral indices lost on server restart | Two-tier durability: local hot memory + Tigris (S3) index snapshots |
| **Context Expansion** | Confined strictly to uploaded documents | Hybrid intelligence: local document search + real-time live web search (Tavily) |
| **Fault Tolerance** | Cascading failures on API downtime | Autonomous circuit breakers (`CLOSED → OPEN → HALF-OPEN`) on all external integrations |
| **Observability** | Unstructured `print()` statements | Loguru JSON logging with trace correlation IDs + Langfuse LLM span monitoring |
| **Data Governance** | Unbounded storage accumulation | Configurable document TTL with automated background purging & lifecycle alerts |

---

## 🏛️ Architecture & System Topology

Lexis is structured into three decoupled, high-performance tiers:

```mermaid
flowchart TD
    subgraph Client ["Client Presentation Layer (React 18 + Vite)"]
        UI["SPA Interface\n(Dark Lab Aesthetic · Tailwind Tokens)"]
        SSE_CLIENT["SSE Token Stream Consumer\n(Optimistic UI · Real-Time Chunk Renderer)"]
    end

    subgraph Gateway ["Application Gateway & Security Layer (FastAPI)"]
        AUTH["Auth Subsystem\n(JWT · Bcrypt · Sliding-Window Rate Limiter)"]
        ROUTERS["REST API Endpoints\n(Documents · Workspaces · Sessions · Settings)"]
        CIRCUITS["Fault-Tolerant Circuit Breakers\n(LLM Breaker · S3 Breaker · Search Breaker)"]
        CACHE[("Redis Cache\nTTL Sessions & Workspace Metadata")]
    end

    subgraph Intelligence ["Document Intelligence & RAG Core"]
        PARSER["Document Ingestion\n(SentenceSplitter · Chunk Normalizer)"]
        VECTOR["LlamaIndex Vector Engine\n(Per-Document VectorStoreIndex)"]
        WEB["Tavily Web Search Layer\n(Live Market & External Context)"]
        LLM_ROUTER["Adaptive Provider Router\n(Gemini 2.5 Flash ↔ Groq Llama 3.3)"]
    end

    subgraph Persistence ["Durability & Storage Subsystem"]
        DB[("NeonDB Serverless\nPostgreSQL · Async SQLAlchemy 2")]
        S3["Tigris Storage Engine\n(S3-Compatible Vector Snapshot Archive)"]
    end

    subgraph Telemetry ["Observability & Governance"]
        LANGFUSE["Langfuse Tracing\n(Span Latency · Token Counts)"]
        APS["APScheduler Worker\n(Document TTL & Expiry Scanner)"]
    end

    UI <-->|"REST + Server-Sent Events"| ROUTERS
    ROUTERS --> AUTH
    AUTH --> CIRCUITS
    ROUTERS <--> CACHE
    ROUTERS <--> DB
    CIRCUITS --> PARSER
    PARSER --> VECTOR
    VECTOR <--> S3
    VECTOR --> LLM_ROUTER
    CIRCUITS -.-> WEB
    WEB --> LLM_ROUTER
    LLM_ROUTER -->|"Stream SSE Tokens"| SSE_CLIENT
    LLM_ROUTER -.-> LANGFUSE
    APS --> DB
    APS --> S3
```

---

## 🚀 Product Capabilities

### 1. Verifiable Source Citation Engine
Every token streamed by the model is continuously grounded against indexed document chunks. Responses generate interactive `[Page X]` and `[Web N]` citation badges that expand into verbatim excerpts, proving source provenance and eliminating hallucination risk.

### 2. Autonomous Dual-Model Failover
Configure your preferred primary model (**Google Gemini 1.5 Flash** or **Groq Llama 3.3**). If the primary provider encounters a rate limit (HTTP 429), gateway timeout (HTTP 504), or service degradation, Lexis automatically trips its circuit breaker and routes token generation to the secondary provider in real time.

### 3. Multi-Document Workspaces
Organize research into collaborative workspaces. Query across dozens of technical papers, compliance manuals, or financial filings simultaneously. The RAG engine aggregates vector scores across multiple indices and synthesizes unified answers with cross-document cross-referencing.

### 4. Hybrid Live Web Augmentation
Toggle on **Web Search Mode** to combine proprietary document knowledge with real-time web intelligence powered by Tavily. Lexis cross-validates internal documents with current market data, news, and external documentation.

### 5. Automated Document Lifecycle Governance
Set document retention policies per file or workspace. A background scheduler scans document metadata every 12 hours, dispatches automated 48-hour expiration notices, safely purges vector indices, and deletes S3 object backups upon expiration.

---

## ⏱️ Quickstart in 3 Minutes

### Prerequisites
- **Python 3.11+** with [`uv`](https://docs.astral.sh/uv/) (`pip install uv`)
- **Node.js 18+** & `npm`
- **PostgreSQL** (local or serverless like [NeonDB](https://neon.tech))
- **Redis** (local or hosted like [Upstash](https://upstash.com))
- At least one API key: [Google Gemini](https://ai.google.dev/) or [Groq](https://console.groq.com/)

---

### 1. Clone & Set Up Backend

```bash
git clone https://github.com/GhananilShirpurkar/Lexis.git
cd Lexis/backend

# Create virtual environment and install dependencies via uv
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
```

### 2. Configure Environment

Create `backend/.env`:

```dotenv
# ── Core Infrastructure ────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/lexis
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=your-32-character-secret-key-here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# ── Primary LLM (Google Gemini) ───────────────────────────
GEMINI_API_KEY=your-gemini-api-key

# ── Fallback LLM (Groq) ───────────────────────────────────
GROQ_API_KEY=your-groq-api-key

# ── Storage & Durability (Tigris / S3) ─────────────────────
S3_BUCKET_NAME=lexis
ENDPOINT_URL_S3=https://fly.storage.tigris.dev
TIGRIS_ACCESS_KEY_ID=your-tigris-access-key
TIGRIS_SECRET_KEY=your-tigris-secret-key

# ── Optional Augmentations ────────────────────────────────
TAVILY_API_KEY=your-tavily-api-key          # Real-time web search
LANGFUSE_PUBLIC_KEY=pk-lf-...               # LLM Observability
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com
```

### 3. Run Migrations & Start Backend

```bash
# Run database schema migrations
alembic upgrade head

# Start high-concurrency async server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

*Interactive Swagger API documentation is live at `http://localhost:8000/docs`.*

---

### 4. Start Frontend

```bash
cd ../frontend
npm install

# Start Vite development server
npm run dev
```

*Open `http://localhost:5173` to access the Lexis workspace.*

---

## 📡 REST & Streaming API

Lexis exposes a fully typed REST and Server-Sent Events (SSE) API:

### Authentication
```http
POST /api/auth/register    # Register operator account
POST /api/auth/login       # Returns JWT bearer token
GET  /api/auth/me          # Retrieve active session metadata
```

### Document Ingestion
```http
POST /api/documents/upload
Content-Type: multipart/form-data

# Uploads file, triggers SentenceSplitter chunking, builds VectorStoreIndex, 
# backups snapshot to Tigris S3, and returns streamable AI overview summary.
```

### Streaming RAG Query (Server-Sent Events)
```http
POST /api/chats/{chat_id}/stream
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>

{
  "prompt": "What are the core indemnification limits in Section 4.2?",
  "model": "gemini-1.5-flash",
  "web_search": false
}
```

**SSE Event Stream Output:**
```
event: token
data: {"token": "Based "}

event: token
data: {"token": "on Section 4.2 [Page 14], the maximum liability is capped at..."}

event: citation
data: {"page_number": 14, "doc_name": "master_agreement.pdf", "excerpt": "..."}

event: done
data: {"finish_reason": "stop", "latency_ms": 482}
```

---

## 📊 RAG Evaluation & Benchmarks

Lexis includes a standalone, automated evaluation harness utilizing **RAGAS** (Retrieval Augmented Generation Assessment) to continuously measure pipeline accuracy and prevent regressions:

```bash
# Run standalone evaluation against golden dataset
EVAL_PROVIDER=gemini RAGAS_LLM=gemini python evaluate.py
```

### Benchmark Metrics Tracked

| Metric | Target | Description |
|---|---|---|
| **Faithfulness** | `> 0.92` | Measures whether LLM claims are strictly derived from source chunks |
| **Answer Relevancy** | `> 0.90` | Evaluates query-answer alignment without extraneous fluff |
| **Context Precision** | `> 0.88` | Evaluates if retrieved chunks place the true answer at rank 1 |
| **Context Recall** | `> 0.89` | Assesses whether all necessary source chunks were retrieved |

*Detailed per-query scoring is saved directly to `evaluation/eval_results.csv`.*

---

## 🛡️ Security & Enterprise Governance

- **Tenant Isolation:** Document embeddings and vector indices are strictly isolated per user and per workspace. One user cannot retrieve or query another user's index files.
- **Circuit Breakers:** Built-in `CircuitBreaker` states isolate third-party outages so failed LLM or web search calls return descriptive recovery states rather than hanging threads.
- **Sliding-Window Rate Limiting:** IP-based and email-based rate limiters prevent brute-force attacks on authentication endpoints.
- **Audit-Ready Structured Logs:** Loguru formats every log line as JSON, tagging requests with a unique `request_id` passed through `contextvars` and returned in the `X-Request-ID` response header.

---

## 📦 Production Deployment

### Backend (Render / Docker)
Lexis includes a production [`render.yaml`](./render.yaml) specification configured for multi-process worker scaling.

```bash
# Production Docker container build
docker build -t lexis-backend:latest ./backend
docker run -p 8000:8000 --env-file ./backend/.env lexis-backend:latest
```

### Frontend (Vercel)
The React application includes a [`vercel.json`](./frontend/vercel.json) router configuration for single-page routing and edge caching.

```bash
cd frontend && npm run build
# Deploy dist/ to any CDN, Vercel, Netlify, or Cloudflare Pages
```

---

## 🗺️ Product Roadmap

- [x] **v1.0 (Core Engine):** Vector RAG, SSE streaming, multi-document workspaces, Tigris durability, circuit breakers.
- [x] **v1.1 (Brand & Identity):** Refractive Prism vector system, xAI frontier lab design system, zero-slop UI.
- [ ] **v1.2 (Hybrid Retrieval):** Fusion of dense vector search with sparse BM25 keyword matching + cross-encoder re-ranking.
- [ ] **v1.3 (Semantic Caching):** Sub-millisecond response caching via Redis vector similarity for duplicate questions.
- [ ] **v1.4 (Agentic Query Routing):** Autonomous query planner decomposing complex questions into multi-step search plans.
- [ ] **v2.0 (Multimodal Vision):** OCR table extraction and chart comprehension from multi-page PDFs.

---

<div align="center">

**[Lexis Document Intelligence](https://github.com/GhananilShirpurkar/Lexis)** · Built with precision for sovereign AI workflows.

Distributed under the MIT License. See `LICENSE` for details.

</div>
