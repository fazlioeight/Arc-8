from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..utils.security import get_current_user
from ..db.session import get_db
from ..services.analytics_service import tenant_totals

router = APIRouter()


@router.get("/api/analytics/dashboard")
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    # Fetch/mock data from DB or analytics logic
    return {
        "user": current_user["email"],
        "highRiskCount": 42,
        "otherMetrics": "example data",
    }


@router.get("/api/analytics/summary")
def get_summary(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return tenant_totals(db, current_user["tenant_id"])
