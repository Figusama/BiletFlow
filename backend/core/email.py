import logging
import smtplib
from email.message import EmailMessage

from fastapi.concurrency import run_in_threadpool

from core.config import settings

logger = logging.getLogger("biletflow.email")


def _send_sync(message: EmailMessage) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


async def send_email(to: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        logger.info("EMAIL (not sent, SMTP_HOST is empty)\nTo: %s\nSubject: %s\n\n%s", to, subject, body)
        return

    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        await run_in_threadpool(_send_sync, message)
    except (OSError, smtplib.SMTPException):
        logger.exception("Failed to send email to %s", to)
