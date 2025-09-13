from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import bcrypt
import uvicorn
from .core.config import settings
from .middleware.tenant import TenantMiddleware
from .middleware.usage import UsageMiddleware

# Routers
from .routes import analytics as analytics_router
from .routes import member_cost as member_cost_router
from .routes import utilization as utilization_router
from .routes import member_risk as member_risk_router
from .utils.security import create_access_token
from .db.session import get_db
from sqlalchemy.orm import Session
from .models.tables import User, Tenant

app = FastAPI()

# Allow CORS for React frontend (update origins as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tenant resolver
app.add_middleware(TenantMiddleware, default_tenant="demo")
app.add_middleware(UsageMiddleware)

# Root route
@app.get("/")
def read_root():
    return {"message": "Nexora Analytics Backend"}

# Pydantic model for login request
class LoginRequest(BaseModel):
    email: str
    password: str
    tenant: str | None = None

# Login route
@app.post("/api/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    try:
        tenant_key = request.tenant or "demo"
        tenant = db.query(Tenant).filter(Tenant.key == tenant_key).first()
        if not tenant:
            raise HTTPException(status_code=401, detail="Unknown tenant")

        user = db.query(User).filter(User.email == request.email, User.tenant_id == tenant.id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if not bcrypt.checkpw(request.password.encode(), user.password_hash.encode()):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        token = create_access_token({"sub": request.email, "tid": tenant.key})
        return {"token": token, "email": request.email, "tenant": tenant.key}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Include routers
app.include_router(analytics_router.router)
app.include_router(member_cost_router.router)
app.include_router(utilization_router.router)
app.include_router(member_risk_router.router)

# Run the app
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
