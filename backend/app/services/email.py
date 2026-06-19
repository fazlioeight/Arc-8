"""Minimal transactional email sender.

Sends plain-text mail over SMTP when a backend is configured. With no
SMTP_HOST set it degrades to logging the message in non-production (so local
dev can exercise the flow end-to-end) and raises ``EmailNotConfigured`` in
production, so a missing relay surfaces loudly instead of silently dropping
mail. This mirrors the deliberately stubbed password-reset email path.
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from ..core.config import settings

logger = logging.getLogger("nexora.email")


class EmailNotConfigured(RuntimeError):
    """Raised when a send is attempted with no SMTP backend configured."""


def _send_sync(message: EmailMessage) -> None:
    """Blocking SMTP send — run in a worker thread via ``send_email``."""
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls()
        if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        smtp.send_message(message)


async def send_email(
    *,
    to: str,
    subject: str,
    body: str,
    reply_to: str | None = None,
) -> bool:
    """Send a plain-text email.

    Returns True when the message was dispatched via SMTP. Returns False when
    no SMTP backend is configured outside production (the message is logged
    instead). Raises ``EmailNotConfigured`` when unconfigured in production.
    """
    sender = settings.EMAIL_FROM or settings.SMTP_USERNAME
    if not settings.SMTP_HOST or not sender:
        if settings.is_production:
            raise EmailNotConfigured("SMTP backend is not configured")
        logger.warning(
            "email_not_configured DEV: would send to=%s subject=%r reply_to=%s\n%s",
            to,
            subject,
            reply_to,
            body,
        )
        return False

    message = EmailMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject
    if reply_to:
        message["Reply-To"] = reply_to
    message.set_content(body)

    # smtplib is blocking; keep the event loop free while it talks to the relay.
    await asyncio.to_thread(_send_sync, message)
    logger.info("email_sent", extra={"to": to, "subject": subject})
    return True
