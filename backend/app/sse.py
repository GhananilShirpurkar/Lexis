from typing import Dict, Set
import asyncio
from uuid import UUID

class SSEManager:
    def __init__(self):
        self._connections: Dict[UUID, Set[asyncio.Queue]] = {}
    
    async def connect(self, chat_id: UUID) -> asyncio.Queue:
        queue = asyncio.Queue()
        self._connections.setdefault(chat_id, set()).add(queue)
        return queue
    
    async def disconnect(self, chat_id: UUID, queue: asyncio.Queue):
        if chat_id in self._connections:
            self._connections[chat_id].discard(queue)
            if not self._connections[chat_id]:
                del self._connections[chat_id]
    
    async def emit(self, chat_id: UUID, data: dict):
        if chat_id in self._connections:
            for queue in list(self._connections[chat_id]):
                await queue.put(data)

sse_manager = SSEManager()
