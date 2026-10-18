from __future__ import annotations

from datetime import datetime
from typing import Dict, Literal, Optional

from pydantic import BaseModel, Field

from .types import NormalizedEmail

PortalAccessLevel = Literal["admin", "manager", "user"]
UserRole = Literal["admin", "user", "platform_admin"]


class ApplicationDefinition(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    purchased: bool = False
    core: bool = False


class AdminUserBase(BaseModel):
    email: NormalizedEmail
    role: UserRole
    is_active: bool
    applications: Dict[str, PortalAccessLevel]


class AdminUser(AdminUserBase):
    id: int
    created_at: Optional[datetime] = None


class AdminUserCreate(BaseModel):
    email: NormalizedEmail
    password: str = Field(min_length=8)
    role: UserRole = "user"
    is_active: bool = True
    applications: Dict[str, PortalAccessLevel] = Field(default_factory=dict)


class AdminUserUpdate(BaseModel):
    password: Optional[str] = Field(default=None, min_length=8)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    applications: Optional[Dict[str, PortalAccessLevel]] = None


class AdminUserListResponse(BaseModel):
    users: list[AdminUser]


class ApplicationListResponse(BaseModel):
    applications: list[ApplicationDefinition]



class ApplicationUpdateRequest(BaseModel):
    purchased: list[str] = Field(default_factory=list)
