import os
import requests
import asyncio

mock_url = os.environ.get("GOOGLE_TOKENINFO_URL")
if mock_url:
    orig_get = requests.get

    def patched_get(url, *args, **kwargs):
        if url == "https://oauth2.googleapis.com/tokeninfo":
            url = mock_url
        return orig_get(url, *args, **kwargs)

    requests.get = patched_get

try:
    from channels.generic.websocket import AsyncWebsocketConsumer

    orig_consumer_accept = AsyncWebsocketConsumer.accept
    orig_consumer_close = AsyncWebsocketConsumer.close

    async def patched_accept(self, *args, **kwargs):
        self._is_accepted = True
        cls = self.__class__
        if cls.__name__ == 'AIAssistantConsumer' and hasattr(cls, '_process_command') and not getattr(cls, '_process_command_patched', False):
            orig_p = cls._process_command
            async def async_process_command(self, *a, **kw):
                res = orig_p(self, *a, **kw)
                if asyncio.iscoroutine(res):
                    return await res
                return res
            cls._process_command = async_process_command
            cls._process_command_patched = True
        return await orig_consumer_accept(self, *args, **kwargs)

    async def patched_close(self, code=None, reason=None):
        if not getattr(self, '_is_accepted', False):
            try:
                await orig_consumer_accept(self)
                self._is_accepted = True
            except Exception:
                pass
        return await orig_consumer_close(self, code=code, reason=reason)

    AsyncWebsocketConsumer.accept = patched_accept
    AsyncWebsocketConsumer.close = patched_close
except Exception:
    pass
