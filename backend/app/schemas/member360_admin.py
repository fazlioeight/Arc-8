"""Pydantic schemas for the Member360 admin surface.

Drives ``/api/member360/admin/*``. Templates already have a schema in
``schemas.member360``; this module only adds the config-table schemas
(risk rules, queues, channels, care option policies) plus audit events.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---- Care journey templates (existing table) ----------------------------


class CareJourneyTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    recommended_for_risk_tier: Optional[str] = None
    default_stages: list[dict[str, Any]] = Field(default_factory=list)
    default_tasks: list[dict[str, Any]] = Field(default_factory=list)


class CareJourneyTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    recommended_for_risk_tier: Optional[str] = None
    default_stages: Optional[list[dict[str, Any]]] = None
    default_tasks: Optional[list[dict[str, Any]]] = None


# ---- Risk rules ---------------------------------------------------------


class RiskRule(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    domain: str
    weight: float
    threshold: Optional[float] = None
    description: Optional[str] = None
    recommendation_template: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RiskRuleCreate(BaseModel):
    name: str
    domain: str
    weight: float = 1.0
    threshold: Optional[float] = None
    description: Optional[str] = None
    recommendation_template: Optional[str] = None
    is_active: bool = True


class RiskRuleUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    weight: Optional[float] = None
    threshold: Optional[float] = None
    description: Optional[str] = None
    recommendation_template: Optional[str] = None
    is_active: Optional[bool] = None


# ---- Task queues --------------------------------------------------------


class TaskQueue(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    sla_priority_hours: dict[str, Any] = Field(default_factory=dict)
    escalation_queue: Optional[str] = None
    routing_rules: dict[str, Any] = Field(default_factory=dict)
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TaskQueueCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sla_priority_hours: dict[str, Any] = Field(default_factory=dict)
    escalation_queue: Optional[str] = None
    routing_rules: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class TaskQueueUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sla_priority_hours: Optional[dict[str, Any]] = None
    escalation_queue: Optional[str] = None
    routing_rules: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


# ---- Outreach channels --------------------------------------------------


class OutreachChannel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    channel_type: str
    provider: Optional[str] = None
    config: dict[str, Any] = Field(default_factory=dict)
    consent_required: bool
    preferred_languages: list[str] = Field(default_factory=list)
    is_active: bool
    created_at: datetime
    updated_at: datetime


class OutreachChannelCreate(BaseModel):
    channel_type: str
    provider: Optional[str] = None
    config: dict[str, Any] = Field(default_factory=dict)
    consent_required: bool = True
    preferred_languages: list[str] = Field(default_factory=list)
    is_active: bool = True


class OutreachChannelUpdate(BaseModel):
    channel_type: Optional[str] = None
    provider: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    consent_required: Optional[bool] = None
    preferred_languages: Optional[list[str]] = None
    is_active: Optional[bool] = None


# ---- Care option policies -----------------------------------------------


class CareOptionPolicy(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    service_type: str
    line_of_business: Optional[str] = None
    max_distance_miles: Optional[float] = None
    min_quality_score: Optional[float] = None
    min_savings_threshold: Optional[float] = None
    network_tier: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CareOptionPolicyCreate(BaseModel):
    service_type: str
    line_of_business: Optional[str] = None
    max_distance_miles: Optional[float] = None
    min_quality_score: Optional[float] = None
    min_savings_threshold: Optional[float] = None
    network_tier: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class CareOptionPolicyUpdate(BaseModel):
    service_type: Optional[str] = None
    line_of_business: Optional[str] = None
    max_distance_miles: Optional[float] = None
    min_quality_score: Optional[float] = None
    min_savings_threshold: Optional[float] = None
    network_tier: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


# ---- Audit events -------------------------------------------------------


class AuditEvent(BaseModel):
    id: int
    actor: str
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class AuditEventListResponse(BaseModel):
    items: list[AuditEvent]
    total: int
