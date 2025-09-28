from __future__ import annotations

from datetime import datetime
from typing import Dict, Literal, Optional

from pydantic import BaseModel, EmailStr, Field

PortalAccessLevel = Literal["admin", "user"]


class ApplicationDefinition(BaseModel):
    key: str
    label: str
    description: Optional[str] = None


class AdminUserBase(BaseModel):
    email: EmailStr
    role: PortalAccessLevel
    is_active: bool
    applications: Dict[str, PortalAccessLevel]


class AdminUser(AdminUserBase):
    id: int
    created_at: Optional[datetime] = None


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    role: PortalAccessLevel = "user"
    is_active: bool = True
    applications: Dict[str, PortalAccessLevel] = Field(default_factory=dict)


class AdminUserUpdate(BaseModel):
    password: Optional[str] = Field(default=None, min_length=8)
    role: Optional[PortalAccessLevel] = None
    is_active: Optional[bool] = None
    applications: Optional[Dict[str, PortalAccessLevel]] = None


class AdminUserListResponse(BaseModel):
    users: list[AdminUser]


class ApplicationListResponse(BaseModel):
    applications: list[ApplicationDefinition]

