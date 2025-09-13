from fastapi import APIRouter, Depends
from ..utils.security import get_current_user

router = APIRouter()


@router.get("/api/analytics/dashboard")
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    # Fetch/mock data from DB or analytics logic
    return {
        "user": current_user["email"],
        "highRiskCount": 42,
        "otherMetrics": "example data",
    }
