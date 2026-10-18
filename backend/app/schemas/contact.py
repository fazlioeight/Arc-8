from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from .types import NormalizedEmail


class ContactRequest(BaseModel):
    """A marketing contact-form submission (public, unauthenticated)."""

    name: str = Field(min_length=1, max_length=120)
    email: NormalizedEmail
    subject: Optional[str] = Field(default=None, max_length=200)
    message: str = Field(min_length=1, max_length=5000)


class ContactResponse(BaseModel):
    status: str
    # True when the message was dispatched via SMTP; False when it was only
    # logged because no relay is configured (non-production).
    delivered: bool
