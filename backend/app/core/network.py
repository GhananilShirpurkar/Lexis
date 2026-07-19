import socket
import aiohttp

_original_init = aiohttp.TCPConnector.__init__

def _ipv4_only_init(self, *args, **kwargs):
    kwargs.setdefault("family", socket.AF_INET)
    _original_init(self, *args, **kwargs)

aiohttp.TCPConnector.__init__ = _ipv4_only_init
