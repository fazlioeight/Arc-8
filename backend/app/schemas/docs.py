from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DocsArticle(BaseModel):
    id: int
    title: str
    summary: Optional[str] = None
    content: Optional[str] = None
    app_key: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DocsArticleCreate(BaseModel):
    title: str
    summary: Optional[str] = None
    content: Optional[str] = None
    app_key: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    status: str = "published"


class DocsArticleListResponse(BaseModel):
    articles: list[DocsArticle]
    total: int
