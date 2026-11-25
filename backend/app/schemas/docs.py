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
    category: Optional[str] = None
    allowed_roles: list[str] = Field(default_factory=list)
    hipaa_classification: str = "HIPAA Minimum-Necessary Scoped"
    tags: list[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DocsArticleCreate(BaseModel):
    title: str
    summary: Optional[str] = None
    content: Optional[str] = None
    app_key: Optional[str] = None
    category: Optional[str] = None
    allowed_roles: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    status: str = "published"


class DocsArticleListResponse(BaseModel):
    articles: list[DocsArticle]
    total: int
    active_role: Optional[str] = None
    hipaa_compliant: bool = True
    audit_logged: bool = True

