import asyncio
from app.db.session import control_session
from app.models.tables import User
from sqlalchemy import select

async def seed():
    demo_users = [
        ('admin@admin.com', 'admin', {'portal': 'admin', 'coding': 'admin', 'dashboard': 'admin', 'member360': 'admin', 'ride_booking': 'admin', 'job_center': 'admin', 'docs': 'admin', 'settings': 'admin', 'admin_console': 'admin', 'providers': 'admin', 'chat': 'admin'}),
        ('dr.chen@prominencehealth.com', 'clinician', {'member360': 'user', 'providers': 'user', 'portal': 'user', 'chat': 'user', 'docs': 'user', 'dashboard': 'user', 'coding': 'user'}),
        ('elena.nurse@prominencehealth.com', 'nurse', {'member360': 'user', 'ride_booking': 'user', 'portal': 'user', 'chat': 'user', 'docs': 'user', 'dashboard': 'user', 'providers': 'user'}),
        ('marcus.coder@prominencehealth.com', 'coder', {'coding': 'user', 'member360': 'user', 'portal': 'user', 'dashboard': 'user', 'docs': 'user'}),
        ('rachel.billing@prominencehealth.com', 'billing', {'dashboard': 'user', 'portal': 'user', 'docs': 'user', 'member360': 'user'}),
        ('james.member@prominencehealth.com', 'patient', {'portal': 'user', 'ride_booking': 'user'}),
        ('coordinator@prominencehealth.com', 'coordinator', {'member360': 'user', 'portal': 'user', 'ride_booking': 'user', 'docs': 'user', 'chat': 'user'}),
        ('supervisor@prominencehealth.com', 'supervisor', {'member360': 'user', 'portal': 'user', 'ride_booking': 'user', 'docs': 'user', 'chat': 'user', 'dashboard': 'user', 'settings': 'user', 'providers': 'user'}),
        ('business.admin@prominencehealth.com', 'business_admin', {'member360': 'user', 'admin_console': 'admin', 'portal': 'user', 'docs': 'user', 'settings': 'admin', 'job_center': 'admin'}),
        ('compliance.auditor@prominencehealth.com', 'compliance_auditor', {'member360': 'user', 'portal': 'user', 'docs': 'user'}),
        ('auditor@prominencehealth.com', 'compliance_auditor', {'member360': 'user', 'portal': 'user', 'docs': 'user'}),
    ]
    # Bcrypt hash for password 'admin' / 'demo123'
    pwd_hash = '$2b$12$5fdQTUeYPIlMbFLlakMdpuKpvosWewgAyAywp4L2WrubWcaBTwMZq'
    async with control_session() as session:
        for email, role, perms in demo_users:
            existing = await session.scalar(select(User).where(User.email == email))
            if not existing:
                u = User(
                    tenant_id=1,
                    email=email,
                    password_hash=pwd_hash,
                    role=role,
                    app_permissions=perms,
                    is_active=True,
                    must_change_password=False,
                )
                session.add(u)
                print(f'Added demo user: {email}')
            else:
                existing.app_permissions = perms
                existing.role = role
                existing.is_active = True
                print(f'Updated demo user: {email}')
        await session.commit()
    print('All demo users successfully processed.')

if __name__ == '__main__':
    asyncio.run(seed())
