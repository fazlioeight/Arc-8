from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Provider(BaseModel):
    id: str
    name: Optional[str] = None
    type: Optional[str] = None


class Location(BaseModel):
    page: Optional[int] = None
    offset_start: Optional[int] = None
    offset_end: Optional[int] = None


class MeatFlags(BaseModel):
    M: bool = False
    E: bool = False
    A: bool = False
    T: bool = False


class EvidenceSnippet(BaseModel):
    snippet_id: str
    source_type: str
    dos: str
    provider: Optional[Provider] = None
    text: str
    meat: MeatFlags
    confidence: float
    qualifying: bool = False
    location: Optional[Location] = None


class Suspect(BaseModel):
    suspect_id: str
    condition: str
    icd_suggestions: List[Dict[str, str]] = Field(default_factory=list)
    evidence: List[EvidenceSnippet] = Field(default_factory=list)
    contradictions: List[Dict[str, Any]] = Field(default_factory=list)
    priority: float = 0.0


class Member(BaseModel):
    id: str
    name: str
    dob: Optional[str] = None
    lob: str


class Encounter(BaseModel):
    id: str
    dos: str
    provider: Provider
    pos: Optional[str] = None


class WorkbenchPayload(BaseModel):
    member: Member
    encounter: Encounter
    suspects: List[Suspect] = Field(default_factory=list)
    documents: List[Dict[str, Any]] = Field(default_factory=list)
    model_year: int


class FinalizeRequest(BaseModel):
    member_id: str
    encounter_id: Optional[str] = None
    suspect_id: str
    selected_icd: Optional[str] = None
    model_year: int = 2025
    lob: str = "MA"
    evidence_used: List[str] = Field(default_factory=list)
    checklist: Dict[str, bool] = Field(default_factory=dict)


class FinalizeResponse(BaseModel):
    status: str
    hcc: Dict[str, Any]
    submission_intent: str
    audit_id: str
