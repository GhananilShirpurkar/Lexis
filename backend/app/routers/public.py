import time
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Request, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.caching import (
    cached_endpoint,
    health_cache,
    metrics_cache,
    templates_cache,
    faqs_cache,
    feature_flags_cache,
    public_library_cache,
    invalidate_templates,
    invalidate_faqs,
    invalidate_feature_flags,
    invalidate_public_library
)

router = APIRouter(prefix="", tags=["Public & System"])

# Pydantic schemas
class TemplateItem(BaseModel):
    id: str
    title: str
    category: str
    description: str
    content: str
    tags: List[str]

class FAQItem(BaseModel):
    id: str
    question: str
    answer: str
    category: str

class FeatureFlagsResponse(BaseModel):
    web_search_enabled: bool
    advanced_rag_enabled: bool
    citation_inspection_enabled: bool
    optimistic_ui_enabled: bool
    maintenance_mode: bool

class PublicDocumentItem(BaseModel):
    id: str
    title: str
    description: str
    file_type: str
    size_bytes: int
    created_at: str

# Seed data for static public endpoints
STATIC_TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "tpl-legal-brief",
        "title": "Standard Legal Case Summary",
        "category": "Legal Analysis",
        "description": "Comprehensive legal brief template with issue, facts, holding, and reasoning sections.",
        "content": "## CASE SUMMARY\n**Issue:**\n[Define core legal issue]\n\n**Procedural History:**\n[Summarize lower court rulings]\n\n**Holding & Reasoning:**\n[Key judicial precedents applied]",
        "tags": ["legal", "brief", "case-study"]
    },
    {
        "id": "tpl-contract-review",
        "title": "Commercial Agreement Audit",
        "category": "Contract Law",
        "description": "Risk assessment checklist for commercial vendor and SaaS contracts.",
        "content": "## CONTRACT REVIEW CHECKLIST\n1. Indemnification & Liability Caps\n2. Data Privacy & GDPR Compliance\n3. Termination for Convenience",
        "tags": ["contracts", "risk", "audit"]
    },
    {
        "id": "tpl-compliance-memo",
        "title": "Regulatory Compliance Memo",
        "category": "Compliance",
        "description": "Structured memo for communicating regulatory updates and policy adherence.",
        "content": "## MEMORANDUM\n**To:** Governance Committee\n**Subject:** Regulatory Directive Alignment\n\n### 1. Executive Summary\n### 2. Statutory Requirements",
        "tags": ["compliance", "governance", "policy"]
    }
]

STATIC_FAQS: List[Dict[str, Any]] = [
    {
        "id": "faq-1",
        "question": "How does Lexis hybrid RAG search work?",
        "answer": "Lexis combines dense vector embeddings with BM25 keyword matching and optional Tavily live web retrieval to provide precise document citations.",
        "category": "RAG Search"
    },
    {
        "id": "faq-2",
        "question": "Is my uploaded document data encrypted and safe?",
        "answer": "Yes, all uploaded documents are encrypted at rest and in transit. Document vectors are scoped strictly to your account or project.",
        "category": "Security"
    },
    {
        "id": "faq-3",
        "question": "What happens if external web search is unavailable?",
        "answer": "Lexis uses automatic circuit breakers. If live web search fails or trips, Lexis falls back gracefully to your local document collection with a warning indicator.",
        "category": "Resilience"
    }
]

STATIC_FEATURE_FLAGS = {
    "web_search_enabled": True,
    "advanced_rag_enabled": True,
    "citation_inspection_enabled": True,
    "optimistic_ui_enabled": True,
    "maintenance_mode": False
}

STATIC_PUBLIC_DOCS: List[Dict[str, Any]] = [
    {
        "id": "pub-doc-1",
        "title": "Lexis Architecture Whitepaper",
        "description": "Overview of hybrid retrieval, circuit breakers, and optimistic UI.",
        "file_type": "PDF",
        "size_bytes": 1048576,
        "created_at": "2026-01-15T00:00:00Z"
    },
    {
        "id": "pub-doc-2",
        "title": "RAG Citation Guidelines",
        "description": "Best practices for extracting and verifying inline citations.",
        "file_type": "PDF",
        "size_bytes": 524288,
        "created_at": "2026-02-01T00:00:00Z"
    }
]


@router.get("/system/metrics", tags=["Public & System"])
@cached_endpoint(metrics_cache, "metrics")
async def get_system_metrics(request: Request):
    """
    Returns system status metrics (cached for 30s).
    """
    return {
        "status": "operational",
        "uptime_percent": 99.98,
        "cache_stats": {
            "health": health_cache.get_stats(),
            "metrics": metrics_cache.get_stats(),
            "templates": templates_cache.get_stats(),
            "faqs": faqs_cache.get_stats(),
            "flags": feature_flags_cache.get_stats(),
            "public_library": public_library_cache.get_stats()
        },
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }


@router.get("/api/public/templates", tags=["Public & System"])
@cached_endpoint(templates_cache, "templates")
async def get_public_templates(request: Request, category: Optional[str] = None):
    """
    Returns public document templates (cached for 1h per locale/query).
    """
    if category:
        filtered = [t for t in STATIC_TEMPLATES if t["category"].lower() == category.lower()]
        return filtered
    return STATIC_TEMPLATES


@router.post("/api/public/templates", tags=["Public & System"])
async def create_public_template(template: TemplateItem):
    """
    Adds a new template and invalidates the templates cache (Event-driven invalidation).
    """
    STATIC_TEMPLATES.append(template.dict())
    invalidate_templates()
    return {"message": "Template created", "id": template.id, "cache_invalidated": True}


@router.get("/api/public/faqs", tags=["Public & System"])
@cached_endpoint(faqs_cache, "faqs")
async def get_public_faqs(request: Request, category: Optional[str] = None):
    """
    Returns public FAQ items (cached for 1h per locale/query).
    """
    if category:
        filtered = [f for f in STATIC_FAQS if f["category"].lower() == category.lower()]
        return filtered
    return STATIC_FAQS


@router.get("/api/features/flags", tags=["Public & System"])
@cached_endpoint(feature_flags_cache, "feature_flags")
async def get_feature_flags(request: Request):
    """
    Returns application feature flags (cached for 5m).
    """
    return STATIC_FEATURE_FLAGS


@router.get("/api/library/public", tags=["Public & System"])
@cached_endpoint(public_library_cache, "public_library")
async def get_public_library(request: Request):
    """
    Returns public document catalog (cached for 5m).
    """
    return STATIC_PUBLIC_DOCS
