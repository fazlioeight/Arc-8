from __future__ import annotations

from typing import Annotated

from pydantic import BeforeValidator


def _normalize_email(value: object) -> object:
    if isinstance(value, str):
        return value.strip().lower()
    return value


# Plain `str` (not EmailStr) because pydantic's email-validator rejects
# special-use TLDs like .local/.test that we use for seeded and demo accounts.
# Normalization keeps create/login lookups case-insensitive against a
# case-sensitive VARCHAR column.
NormalizedEmail = Annotated[str, BeforeValidator(_normalize_email)]
