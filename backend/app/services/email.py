"""Minimal transactional email sender.

Sends plain-text mail via SendGrid (v3 Web API) when ``SENDGRID_API_KEY`` is
set, otherwise via SMTP when ``SMTP_HOST`` is set. With no provider configured
it degrades to logging the message in non-production (so local dev can
exercise the flow end-to-end) and raises ``EmailNotConfigured`` in production,
so a missing relay surfaces loudly instead of silently dropping mail. This
mirrors the deliberately stubbed password-reset email path.
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage

import httpx

from ..core.config import settings

logger = logging.getLogger("nexora.email")

SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send"


class EmailNotConfigured(RuntimeError):
    """Raised when a send is attempted with no email provider configured."""


class EmailSendError(RuntimeError):
    """Raised when a configured provider rejects or fails the send."""


async def _send_via_sendgrid(
    *,
    sender: str,
    to: str,
    subject: str,
    body: str,
    reply_to: str | None,
) -> None:
    payload: dict = {
        "personalizations": [{"to": [{"email": to}]}],
        "from": {"email": sender},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
    }
    if reply_to:
        payload["reply_to"] = {"email": reply_to}
    headers = {
        "Authorization": f"Bearer {settings.SENDGRID_API_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(SENDGRID_API_URL, json=payload, headers=headers)
    # SendGrid returns 202 Accepted on success; any 4xx/5xx carries an error
    # body we log (but don't surface to the caller).
    if response.status_code >= 400:
        logger.error(
            "sendgrid_send_failed status=%s body=%s",
            response.status_code,
            response.text[:500],
        )
        raise EmailSendError(f"SendGrid returned {response.status_code}")


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
    """Send a plain-text email via the configured provider.

    Returns True when the message was dispatched (SendGrid or SMTP). Returns
    False when no provider is configured outside production (the message is
    logged instead). Raises ``EmailNotConfigured`` when unconfigured in
    production, or ``EmailSendError`` when a configured provider fails.
    """
    sender = settings.EMAIL_FROM or settings.SMTP_USERNAME

    if settings.SENDGRID_API_KEY and sender:
        await _send_via_sendgrid(
            sender=sender, to=to, subject=subject, body=body, reply_to=reply_to
        )
        logger.info("email_sent", extra={"to": to, "subject": subject, "provider": "sendgrid"})
        return True

    if settings.SMTP_HOST and sender:
        message = EmailMessage()
        message["From"] = sender
        message["To"] = to
        message["Subject"] = subject
        if reply_to:
            message["Reply-To"] = reply_to
        message.set_content(body)
        # smtplib is blocking; keep the event loop free while it talks to the relay.
        await asyncio.to_thread(_send_sync, message)
        logger.info("email_sent", extra={"to": to, "subject": subject, "provider": "smtp"})
        return True

    if settings.is_production:
        raise EmailNotConfigured("No email provider is configured")
    logger.warning(
        "email_not_configured DEV: would send to=%s subject=%r reply_to=%s\n%s",
        to,
        subject,
        reply_to,
        body,
    )
    return False
