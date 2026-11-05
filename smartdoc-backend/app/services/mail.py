"""SMTP delivery; Mailpit captures local mail, no external provider required."""
import smtplib
import uuid
from pathlib import Path
from email.message import EmailMessage
from app.core.config import settings


def send_auth_mail(email: str, subject: str, url: str):
    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = email
    message["Subject"] = subject
    message.set_content(f"{subject}\n\nBuka tautan berikut:\n{url}\n\nJika Anda tidak meminta ini, abaikan email ini.")
    if settings.MAIL_TRANSPORT == "local":
        if settings.APP_ENV.lower() != "development":
            raise RuntimeError("Kotak email lokal hanya tersedia di environment development.")
        outbox = Path(settings.STORAGE_PATH).resolve().parent / ".local-mail"
        outbox.mkdir(parents=True, exist_ok=True)
        target = outbox / f"{uuid.uuid4().hex}.eml"
        target.write_bytes(message.as_bytes())
        return
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        smtp.send_message(message)
