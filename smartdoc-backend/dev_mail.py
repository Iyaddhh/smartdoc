"""Local-only email viewer. Run with the backend Python environment; open :8025."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from email import policy
from email.parser import BytesParser
import html
import re
from app.core.config import settings


class Inbox(BaseHTTPRequestHandler):
    def do_GET(self):
        if settings.APP_ENV.lower() != "development" or self.path != "/":
            self.send_error(404)
            return
        root = Path(settings.STORAGE_PATH).resolve().parent / ".local-mail"
        cards = []
        for path in sorted(root.glob("*.eml"), key=lambda p: p.stat().st_mtime, reverse=True)[:100]:
            message = BytesParser(policy=policy.default).parsebytes(path.read_bytes())
            body = message.get_body(preferencelist=("plain",))
            text = body.get_content() if body else ""
            links = [url for url in re.findall(r'https?://[^\s]+', text) if url.startswith(settings.FRONTEND_URL.rstrip("/")+"/")]
            cards.append(f"<article><h2>{html.escape(str(message['Subject']))}</h2><p>Kepada: {html.escape(str(message['To']))}</p><pre>{html.escape(text)}</pre>" + "".join(f'<p><a href="{html.escape(url, quote=True)}">Buka tautan</a></p>' for url in links) + "</article>")
        page = '<!doctype html><html lang="id"><meta charset="utf-8"><title>Email lokal SmartDoc</title><style>body{font:16px system-ui;max-width:850px;margin:40px auto;padding:20px;background:#fafaf9}article{padding:24px;background:white;border:1px solid #ddd;margin:20px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#176ca3}</style><h1>Email lokal SmartDoc</h1><p>Email ditangkap di komputer ini, tidak dikirim ke luar. <a href="/">Muat ulang</a></p>' + ("".join(cards) or '<p>Belum ada email. Daftar atau minta reset password di SmartDoc.</p>') + '</html>'
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(page.encode())


if __name__ == "__main__":
    if settings.APP_ENV.lower() != "development":
        raise SystemExit("Only available for local development")
    print("Email lokal: http://127.0.0.1:8025", flush=True)
    ThreadingHTTPServer(("127.0.0.1",8025),Inbox).serve_forever()
