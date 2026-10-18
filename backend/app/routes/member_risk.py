from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..models.coding import CodingMember, CodingMemberPriority
from ..models.member360 import Member360Member
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user

router = APIRouter()

# Map the coding-domain priority tier vocabulary onto the Member360 risk-tier
# vocabulary the Lab UI renders, so a coding-sourced response uses the same
# tiers as a member360-sourced one.
_CODING_TIER_TO_LAB = {"high": "high", "normal": "rising", "low": "low"}


def _as_float(value) -> float | None:
    return float(value) if value is not None else None


def _empty_risk(member_id: str) -> dict:
    return {
        "member_id": member_id,
        "risk_score_composite": None,
        "risk_tier": None,
        "clinical_risk_score": None,
        "utilization_risk_score": None,
        "cost_risk_score": None,
        "engagement_risk_score": None,
        "hcc_opportunity_count": 0,
        "source": None,
    }


@router.get("/member/{member_id}/risk")
async def get_member_risk(
    member_id: str,
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    control_session: AsyncSession = Depends(get_control_session),
    tenant_session: AsyncSession = Depends(get_tenant_session),
):
    """Return a member's composite risk in the Member360 Lab shape.

    Primary source is the Member360 member record (the canonical home of the
    composite + sub-scores). For members that only exist in the coding domain
    we fall back to their ``CodingMemberPriority`` row, mapping the priority
    score/tier into the same field names (sub-scores the coding domain doesn't
    compute are returned as null rather than fabricated).
    """
    risk = _empty_risk(member_id)

    m360 = await tenant_session.scalar(
        select(Member360Member).where(Member360Member.member_key == member_id)
    )
    if m360 is not None:
        risk.update(
            {
                "risk_score_composite": _as_float(m360.risk_score_composite),
                "risk_tier": m360.risk_tier,
                "clinical_risk_score": _as_float(m360.clinical_risk_score),
                "utilization_risk_score": _as_float(m360.utilization_risk_score),
                "cost_risk_score": _as_float(m360.cost_risk_score),
                "engagement_risk_score": _as_float(m360.engagement_risk_score),
                "source": "member360",
            }
        )
    else:
        member = await tenant_session.scalar(
            select(CodingMember).where(CodingMember.member_key == member_id)
        )
        if member is not None:
            priority = await tenant_session.scalar(
                select(CodingMemberPriority).where(CodingMemberPriority.member_id == member.id)
            )
            if priority is not None:
                risk.update(
                    {
                        "risk_score_composite": _as_float(priority.priority_score),
                        "risk_tier": _CODING_TIER_TO_LAB.get(priority.priority_tier, priority.priority_tier),
                        # Only the clinical dimension has a coding-domain signal
                        # (HCC opportunities); the rest stay null here.
                        "clinical_risk_score": float(priority.hcc_opportunity_count or 0),
                        "hcc_opportunity_count": priority.hcc_opportunity_count,
                        "source": "coding",
                    }
                )

    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member.risk.view",
        payload={"member_id": member_id, "source": risk["source"]},
    )
    await control_session.commit()

    risk["requested_by"] = current_user.email
    risk["tenant"] = tenant.key
    return risk
