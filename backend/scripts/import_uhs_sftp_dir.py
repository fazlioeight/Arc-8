"""Batch-load a directory of 17 UHS SFTP pipe-delimited extract files into the Arc-8 tenant DB
and record the import jobs in ``data_import_jobs`` for the Job Status Center UI.

Usage:
    python scripts/import_uhs_sftp_dir.py [path/to/10Nov2026]
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models import load_all_models  # noqa: E402
from app.models.member360 import Member360Member, Member360RiskInsight  # noqa: E402
from app.models.tables import (  # noqa: E402
    ControlBase,
    DataImportJob,
    DataImportJobLog,
    Tenant,
    TenantDataBase,
)
from app.services.uhs_sftp_importer import detect_uhs_feed_type, import_uhs_file  # noqa: E402

# Ordered so parent entities (providers, members) exist before dependent feeds
LOAD_ORDER = [
    "provider_details",
    "provider_location",
    "provider_affiliation",
    "provider_payto",
    "group_details",
    "broker_details",
    "member_details",
    "enrollment_details",
    "member_pcp_details",
    "member_designee",
    "accum_details",
    "claim_details",
    "claim_edits",
    "claim_mail_date",
    "pharmacy",
    "call_tracking_detail",
    "call_tracking_notes",
]


async def run_batch(directory: Path) -> None:
    load_all_models()
    db_url = settings.DEFAULT_TENANT_DATABASE_URL or settings.CONTROL_DATABASE_URL
    control_url = settings.CONTROL_DATABASE_URL
    if not db_url:
        raise RuntimeError("DEFAULT_TENANT_DATABASE_URL is not configured")

    engine = create_async_engine(db_url, future=True, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(TenantDataBase.metadata.create_all)

    control_engine = create_async_engine(control_url, future=True, echo=False)
    async with control_engine.begin() as conn:
        await conn.run_sync(ControlBase.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    control_factory = async_sessionmaker(control_engine, expire_on_commit=False)

    discovered: dict[str, Path] = {}
    for file_path in sorted(directory.glob("*.txt")):
        with file_path.open("r", encoding="utf-8-sig", errors="ignore") as fh:
            header = fh.readline().strip().lstrip("\ufeff")
        feed_type = detect_uhs_feed_type(file_path.name, header)
        if feed_type:
            discovered[feed_type] = file_path

    async with control_factory() as c_sess:
        tenant = await c_sess.scalar(select(Tenant).limit(1))
        tenant_id = tenant.id if tenant else 1
        # Remove prior batch SFTP job rows so reruns don't duplicate
        await c_sess.execute(
            delete(DataImportJob).where(DataImportJob.source_type == "sftp")
        )
        await c_sess.commit()

    async with factory() as session:
        for idx, feed in enumerate(LOAD_ORDER, start=1):
            path = discovered.get(feed)
            if not path:
                continue
            started = datetime.now(timezone.utc)
            feed_type, count = await import_uhs_file(session, path)
            await session.commit()
            completed = datetime.now(timezone.utc)
            print(f"[OK] {path.name:52s} -> {feed_type:22s} ({count} rows)")

            async with control_factory() as c_sess:
                job_id = str(uuid.uuid4())
                job = DataImportJob(
                    id=job_id,
                    tenant_id=tenant_id,
                    name=f"UHS SFTP Extract ({idx}/17) — {feed_type}",
                    source_type="sftp",
                    entity=feed_type,
                    file_name=path.name,
                    file_size=path.stat().st_size,
                    file_path=str(path),
                    mime_type="text/plain",
                    status="completed",
                    progress=100,
                    records_processed=count,
                    records_failed=0,
                    initiated_by="admin@prominencehealth.com",
                    job_metadata={"batch": "10Nov2026", "delimiter": "|"},
                    started_at=started,
                    completed_at=completed,
                )
                c_sess.add(job)
                await c_sess.flush()
                c_sess.add(
                    DataImportJobLog(
                        job_id=job_id,
                        level="info",
                        message=f"Imported {count} pipe-delimited records from {path.name} into tenant database.",
                    )
                )
                await c_sess.commit()

        # Enrich imported UHS members (MEM001001..MEM001050) with 0.0-10.0 risk scores & plain-English insights
        uhs_members = (
            await session.execute(
                select(Member360Member).where(Member360Member.member_key.like("MEM0010%"))
            )
        ).scalars().all()
        tiers = ["low", "moderate", "high", "complex"]
        actions = [
            "Schedule post-outreach medication reconciliation",
            "Confirm annual wellness visit with assigned PCP",
            "Review chronic condition care gaps (Diabetes / Hypertension)",
            "Follow up on recent specialist claim and copay accumulator",
        ]
        insight_templates = [
            ("Clinical", "Hypertensive readings trending up over last quarter", "Schedule BP recheck and medication review."),
            ("Clinical", "Uncontrolled HbA1c with last result above goal", "Schedule diabetes follow-up within 2 weeks."),
            ("Clinical", "Multiple chronic conditions requiring coordination", "Enroll in chronic condition management program."),
            ("Clinical", "Recent ED visit indicating acute care risk", "Care manager outreach within 48 hours."),
            ("Utilization", "PCP visit gap exceeds 12 months", "Outreach to schedule annual wellness visit."),
            ("Utilization", "Frequent specialist visits without PCP coordination", "Care navigation referral."),
            ("Cost", "Pharmacy spend trending up year-over-year", "Medication review for therapeutic alternatives."),
            ("Engagement", "Low portal engagement and missed digital reminders", "Switch outreach channel to phone."),
        ]
        for i, m in enumerate(uhs_members):
            tier = tiers[i % len(tiers)]
            base_score = {"low": 2.3, "moderate": 4.7, "high": 6.9, "complex": 8.8}[tier]
            step = ((i // 4) % 5) * 0.1
            clinical = round(min(9.8, base_score + 0.4 + step), 1)
            utilization = round(max(1.0, base_score - 0.3 + step), 1)
            cost = round(min(9.7, base_score + 0.2 + step), 1)
            engagement = round(max(1.0, base_score - 0.5 + step), 1)
            composite = round(0.35 * clinical + 0.25 * utilization + 0.25 * cost + 0.15 * engagement, 1)
            if composite >= 8.0:
                m.risk_tier = "complex"
            elif composite >= 6.0:
                m.risk_tier = "high"
            elif composite >= 3.5:
                m.risk_tier = "moderate"
            else:
                m.risk_tier = "low"
            m.risk_score_composite = Decimal(f"{composite:.1f}")
            m.clinical_risk_score = Decimal(f"{clinical:.1f}")
            m.utilization_risk_score = Decimal(f"{utilization:.1f}")
            m.cost_risk_score = Decimal(f"{cost:.1f}")
            m.engagement_risk_score = Decimal(f"{engagement:.1f}")
            m.open_care_gaps = (i % 4) + 1
            m.next_best_action = actions[i % len(actions)]
            m.last_interaction_at = datetime(2026, 10, 15, 10, 30)

            dom_label, driver_text, rec_text = insight_templates[i % len(insight_templates)]
            dom_score = {
                "Clinical": clinical,
                "Utilization": utilization,
                "Cost": cost,
                "Engagement": engagement,
            }.get(dom_label, clinical)
            existing_insights = (
                await session.execute(
                    select(Member360RiskInsight).where(Member360RiskInsight.member_id == m.id)
                )
            ).scalars().all()
            if not existing_insights:
                session.add(
                    Member360RiskInsight(
                        member_id=m.id,
                        domain=dom_label,
                        score=float(dom_score),
                        driver=driver_text,
                        recommendation=rec_text,
                        confidence=0.92,
                    )
                )
            else:
                for ins in existing_insights:
                    if not ins.driver or "qnxt" in ins.driver.lower() or "feed analysis" in ins.driver.lower():
                        ins.domain = dom_label
                        ins.driver = driver_text
                        ins.recommendation = rec_text
                        ins.score = float(dom_score)
        await session.commit()

    await engine.dispose()
    await control_engine.dispose()


if __name__ == "__main__":
    default_dir = (
        Path(__file__).resolve().parent.parent.parent
        / "data"
        / "uhs_synthetic_sftp"
        / "10Nov2026"
    )
    if not default_dir.exists():
        default_dir = Path(__file__).resolve().parent / "uhs_synthetic_sftp" / "10Nov2026"
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else default_dir
    asyncio.run(run_batch(target))
