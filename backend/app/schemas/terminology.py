from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field


class ICDMapResponse(BaseModel):
    code: str
    hcc: str
    alternatives: List[str] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)
