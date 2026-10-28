from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..core.config import settings
from ..middleware.rate_limit import auth_rate_limit
from ..schemas.contact import ContactRequest, ContactResponse
from ..services.email import EmailNotConfigured, send_email

logger = logging.getLogger("nexora.contact")

router = APIRouter(prefix="/api", tags=["contact"])


@router.post("/contact", response_model=ContactResponse, status_code=status.HTTP_202_ACCEPTED)
async def submit_contact(
    payload: ContactRequest,
    # Public endpoint — reuse the strict per-IP auth limiter as basic spam
    # protection (no authentication, so this is the only gate).
    _rl: None = Depends(auth_rate_limit),
) -> ContactResponse:
    subject = f"[Arc-8 contact] {payload.subject or 'New inquiry'}"
    body = (
        f"Name: {payload.name}\n"
        f"Email: {payload.email}\n"
        f"Subject: {payload.subject or '(none)'}\n\n"
        f"{payload.message}\n"
    )
    try:
        delivered = await send_email(
            to=settings.CONTACT_INBOX_EMAIL,
            subject=subject,
            body=body,
            # So replying in the inbox goes straight back to the submitter.
            reply_to=payload.email,
        )
    except EmailNotConfigured:
        logger.error("contact_email_unconfigured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Contact form is temporarily unavailable. Please try again later.",
        )
    except Exception:  # noqa: BLE001
        logger.exception("contact_email_failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not send your message. Please try again later.",
        )
    return ContactResponse(status="received", delivered=delivered)
