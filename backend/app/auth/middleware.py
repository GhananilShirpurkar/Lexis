import uuid
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.auth.jwt import decode_token

class JWTMiddleware(BaseHTTPMiddleware):
    """
    Middleware to intercept incoming requests and validate the Bearer JWT token.
    Allows public endpoints (docs, health, auth) to pass without verification.
    """
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        
        # Public endpoints that bypass authentication checks
        public_prefixes = [
            "/auth/register",
            "/auth/login",
            "/health",
            "/docs",
            "/redoc",
            "/openapi.json"
        ]
        
        # Let public routes pass
        if path == "/" or any(path == prefix or path.startswith(prefix + "/") for prefix in public_prefixes):
            return await call_next(request)
            
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={
                    "error": {
                        "code": "UNAUTHORIZED",
                        "message": "Authorization header is missing."
                    }
                }
            )
            
        # Verify Bearer token structure
        parts = auth_header.split(" ")
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return JSONResponse(
                status_code=401,
                content={
                    "error": {
                        "code": "UNAUTHORIZED",
                        "message": "Authorization header must start with 'Bearer '."
                    }
                }
            )
            
        token = parts[1]
        payload = decode_token(token)
        if not payload:
            return JSONResponse(
                status_code=401,
                content={
                    "error": {
                        "code": "UNAUTHORIZED",
                        "message": "Invalid or expired access token."
                    }
                }
            )
            
        # Attach validated user context to the request state
        try:
            request.state.user_id = uuid.UUID(payload["sub"])
        except ValueError:
            return JSONResponse(
                status_code=401,
                content={
                    "error": {
                        "code": "UNAUTHORIZED",
                        "message": "Invalid user identification format."
                    }
                }
            )
            
        request.state.email = payload["email"]
        
        return await call_next(request)
