import csv
from pathlib import Path
from datetime import datetime
import bcrypt
from sqlalchemy.orm import Session
from sqlalchemy import create_engine

from app.models.tables import Base, Tenant, User, Member, Claim


def main():
    # Use SQLite dev DB if DATABASE_URL not set; align with app/db/session.py default
    from app.db.session import engine
    Base.metadata.create_all(bind=engine)
    db = Session(bind=engine)
    try:
        # Ensure demo tenant
        tenant = db.query(Tenant).filter(Tenant.key == "demo").first()
        if not tenant:
            tenant = Tenant(key="demo", name="Demo Tenant")
            db.add(tenant)
            db.flush()

        # Ensure admin user
        admin = db.query(User).filter(User.email == "admin@admin.com", User.tenant_id == tenant.id).first()
        if not admin:
            pw_hash = bcrypt.hashpw(b"admin", bcrypt.gensalt()).decode()
            admin = User(tenant_id=tenant.id, email="admin@admin.com", password_hash=pw_hash, role="admin")
            db.add(admin)

        # Load claims from CSV
        base_dir = Path(__file__).resolve().parents[2]
        csv_path = base_dir / "claims_data.csv"
        if csv_path.exists():
            with csv_path.open(newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    member_key = row.get("MemberID") or row.get("member_id")
                    if not member_key:
                        continue
                    # Ensure member
                    member = db.query(Member).filter(Member.member_key == member_key, Member.tenant_id == tenant.id).first()
                    if not member:
                        member = Member(tenant_id=tenant.id, member_key=member_key, name=None)
                        db.add(member)

                    # Insert claim
                    cost = float(row.get("Cost") or 0)
                    svc_date_str = row.get("ServiceDate") or row.get("service_date")
                    svc_date = None
                    if svc_date_str:
                        try:
                            svc_date = datetime.fromisoformat(svc_date_str).date()
                        except Exception:
                            try:
                                svc_date = datetime.strptime(svc_date_str, "%Y-%m-%d").date()
                            except Exception:
                                svc_date = None
                    db.add(Claim(tenant_id=tenant.id, member_key=member_key, service_date=svc_date, cost=cost))

        db.commit()
        print("Seeded demo tenant, user, and claims.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

