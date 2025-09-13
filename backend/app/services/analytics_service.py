from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models.tables import Claim, Tenant


def tenant_totals(db: Session, tenant_key: str) -> dict:
    tenant = db.query(Tenant).filter(Tenant.key == tenant_key).first()
    if not tenant:
        return {"tenant": tenant_key, "total_claims": 0, "total_cost": 0.0}
    total_claims = db.query(func.count(Claim.id)).filter(Claim.tenant_id == tenant.id).scalar() or 0
    total_cost = db.query(func.coalesce(func.sum(Claim.cost), 0)).filter(Claim.tenant_id == tenant.id).scalar() or 0
    try:
        total_cost = float(total_cost)
    except Exception:
        total_cost = 0.0
    return {"tenant": tenant_key, "total_claims": int(total_claims), "total_cost": total_cost}

