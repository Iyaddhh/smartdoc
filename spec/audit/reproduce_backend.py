"""Non-destructive audit reproductions; temporary files and mocked persistence only."""
import asyncio
import io
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'smartdoc-backend'))
from httpx import ASGITransport, AsyncClient
from pypdf import PdfWriter, PdfReader
from app.main import app
from app.core.security import get_current_user
from app.db.base import get_db
from app.api import compressor
from app.services.converter import office
from app.services.watermark.pdf import apply_watermark_and_security


async def main():
    evidence = {}
    db = AsyncMock()
    async def fake_db():
        yield db
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid4())
    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            response = await client.get('/api/documents?limit=1000')
            evidence['history_count_request'] = {'status': response.status_code, 'message': response.json()['error']}
            statuses = [(await client.get('/api/documents?limit=1000')).status_code for _ in range(130)]
            evidence['default_rate_limit'] = {'requests': len(statuses), 'rate_limited': statuses.count(429)}
    finally:
        app.dependency_overrides.clear()

    with tempfile.TemporaryDirectory(prefix='smartdoc_audit_') as temp:
        base = Path(temp)
        job, doc = SimpleNamespace(status='pending', progress=0), SimpleNamespace(status='pending')
        db.get.side_effect = lambda model, key: job if model.__name__ == 'Job' else doc
        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=db)
        context.__aexit__ = AsyncMock(return_value=False)
        with patch.object(compressor, 'AsyncSessionLocal', return_value=context), patch.object(compressor, 'async_compress_pdf', new=AsyncMock(return_value=False)):
            await compressor._run_compress_job(str(uuid4()), str(uuid4()), str(base/'input.pdf'), str(base/'no-output.pdf'), '.pdf', 85, 150)
        evidence['compression_failure'] = {'job_status': job.status, 'document_status': doc.status, 'output_exists': (base/'no-output.pdf').exists()}

        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        input_path, output_path = base/'input.pdf', base/'encrypted.pdf'
        with input_path.open('wb') as stream:
            writer.write(stream)
        apply_watermark_and_security(str(input_path), str(output_path), password='audit-test')
        encryption = PdfReader(str(output_path)).trailer['/Encrypt']
        evidence['pdf_encryption'] = {key: encryption.get(key) for key in ['/V', '/R', '/Length']}

        proc = SimpleNamespace(communicate=AsyncMock(side_effect=lambda: asyncio.sleep(10)), kill=MagicMock(), wait=AsyncMock())
        async def communicate():
            await asyncio.sleep(10)
        proc.communicate = communicate
        with patch.object(office, '_find_libreoffice_binary', return_value='mock-soffice'), patch.object(asyncio, 'create_subprocess_exec', new=AsyncMock(return_value=proc)):
            try:
                await asyncio.wait_for(office.async_convert_office_to_pdf(str(base/'input.docx'), str(base/'output.pdf'), timeout=10), timeout=0.02)
            except asyncio.TimeoutError:
                pass
        evidence['outer_job_timeout'] = {'subprocess_kill_called': proc.kill.called}
    print(json.dumps(evidence, indent=2))


asyncio.run(main())
