from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class UserPreferencesPayload(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)
    memories: list[str] = Field(default_factory=list)


class UserPreferencesResponse(UserPreferencesPayload):
    pass
