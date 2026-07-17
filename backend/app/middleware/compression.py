from starlette.middleware.gzip import GZipMiddleware
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

class SelectiveGZipMiddleware(GZipMiddleware):
    """
    Selective GZip middleware for FastAPI/Starlette.
    - Compresses JSON and text responses >= minimum_size (default 1000 bytes)
    - Bypasses compression for Server-Sent Events (SSE) routes and stream requests
    - Prevents double-compressing already encoded payloads
    """
    def __init__(self, app: ASGIApp, minimum_size: int = 1000, compresslevel: int = 6) -> None:
        super().__init__(app, minimum_size=minimum_size, compresslevel=compresslevel)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            headers = Headers(scope=scope)
            accept = headers.get("accept", "")
            path = scope.get("path", "")

            # Direct bypass for SSE stream endpoints to preserve real-time streaming latency
            if "text/event-stream" in accept or path.endswith("/messages"):
                await self.app(scope, receive, send)
                return

        await super().__call__(scope, receive, send)
