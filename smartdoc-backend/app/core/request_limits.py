"""Enforce request size before multipart parsing, including chunked uploads."""
from fastapi import HTTPException
from app.core.config import settings
from app.core.response import fail_response


class RequestSizeLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        maximum = settings.MAX_REQUEST_SIZE_MB * 1024 * 1024
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            response = fail_response("Content-Length tidak valid.", status_code=400)
            return await response(scope, receive, send)
        if declared < 0 or declared > maximum:
            response = fail_response("Ukuran total request melebihi batas yang diizinkan.", status_code=413)
            return await response(scope, receive, send)
        received = 0

        async def bounded_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > maximum:
                    raise HTTPException(status_code=413, detail="Ukuran total request melebihi batas yang diizinkan.")
            return message

        await self.app(scope, bounded_receive, send)
