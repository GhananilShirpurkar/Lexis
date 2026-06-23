from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.auth.middleware import JWTMiddleware
from app.routers.auth import router as auth_router

# Initialize FastAPI application instance
app = FastAPI(
    title="Lexis API",
    description="Backend API for Lexis SaaS RAG Application",
    version="1.0.0"
)

# Register routers
app.include_router(auth_router)


# Configure CORS origins
# React + Vite development server usually runs on http://localhost:5173
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Add Auth and CORS Middleware
app.add_middleware(JWTMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health Check"])
async def health_check():
    """
    Health check endpoint returning system status.
    """
    return {
        "status": "healthy",
        "app": "Lexis RAG API",
        "version": "1.0.0"
    }

@app.get("/", tags=["Root"])
async def root():
    """
    Root route welcoming users.
    """
    return {
        "message": "Welcome to Lexis RAG API. Please visit /docs for API documentation."
    }
