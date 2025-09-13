from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..db.session import get_db
from ..models.tables import Claim, Tenant

router = APIRouter()

@router.get("/member/{member_id}/costs")
def get_member_costs(member_id: str, request: Request, db: Session = Depends(get_db)):
    tenant_key = getattr(request.state, "tenant_id", None) or "demo"
    tenant = db.query(Tenant).filter(Tenant.key == tenant_key).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    total = db.query(func.coalesce(func.sum(Claim.cost), 0)).filter(
        Claim.tenant_id == tenant.id,
        Claim.member_key == member_id,
    ).scalar()
    try:
        total_cost = float(total)
    except Exception:
        total_cost = 0.0
    return {"member_id": member_id, "total_cost": total_cost, "tenant": tenant_key}
