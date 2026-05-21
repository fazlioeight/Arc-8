"""Seed the Prominence tenant with 50 demo members + 5–8 claims each.

This is a one-shot, idempotent demo loader. It is NOT part of the deploy
pipeline — the user invokes it on demand (typically as a Container App job
the first time the tenant is provisioned, or when reset demo data is
desired).

Design constraints
------------------
* No literal seed payloads in source. The script generates rows from small
  vocabulary tuples + a seeded Random — the same seed produces the same
  data across runs, so reruns are deterministic without committing a
  50-row Python list. The vocabularies (first names, plan names, claim
  categories) are *generation inputs*, not the data itself.
* Idempotent: counts existing m360_members; if at least ``TARGET_MEMBER_COUNT``
  are already there, the script logs and exits 0. Otherwise it inserts
  exactly the shortfall.
* PHI shape: names + addresses are obviously-synthetic-but-plausible. No
  real identifiers (SSN, MBI) are generated.

Run locally:
    DEFAULT_TENANT_DATABASE_URL=postgresql+asyncpg://... \\
      python scripts/seed_prominence_demo.py

Run as a Container App job (azure-prod path):
    az containerapp job create -g <rg> -n nexora-platform-seed-demo \\
      --image <acr>/nexora-platform:<tag> \\
      --environment <aca-env> \\
      --command python --args scripts/seed_prominence_demo.py \\
      --secrets tenant-db-url=<kv-uri> \\
      --env-vars ENVIRONMENT=production PYTHONPATH=/app \\
                 DEFAULT_TENANT_DATABASE_URL=secretref:tenant-db-url \\
      --trigger-type Manual --replica-timeout 300
    az containerapp job start  -g <rg> -n nexora-platform-seed-demo
"""
from __future__ import annotations

import asyncio
import os
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings  # noqa: E402
from app.models import load_all_models  # noqa: E402
from app.models.member360 import Member360Claim, Member360Member  # noqa: E402


# ── Configuration knobs ─────────────────────────────────────────────────────

TARGET_MEMBER_COUNT = 50
MIN_CLAIMS_PER_MEMBER = 5
MAX_CLAIMS_PER_MEMBER = 8

# Fixed seed so reruns produce the same synthetic identities. Change this if
# you want a different deterministic dataset; keep it stable if you want
# reproducible demos.
RANDOM_SEED = 4242


# ── Generation vocabularies (inputs, not payloads) ─────────────────────────
# Small tuples the generator samples from to construct rows. These are
# acceptable in source because they're vocabulary primitives, not 50 rows
# of seed data.

_FIRST_NAMES_F = (
    "Aaliyah", "Beatrice", "Camila", "Daniela", "Elena", "Fatima", "Grace",
    "Hannah", "Iris", "Janelle", "Kiana", "Leah", "Maya", "Nora", "Olivia",
    "Priya", "Quinn", "Rosa", "Sophia", "Tara", "Uma", "Vanessa", "Willa",
    "Ximena", "Yara", "Zoe",
)
_FIRST_NAMES_M = (
    "Aaron", "Bryan", "Carlos", "Diego", "Elliot", "Felix", "Gabriel",
    "Hassan", "Isaac", "Julian", "Kai", "Leon", "Marcus", "Nikolas", "Owen",
    "Pedro", "Quincy", "Rafael", "Samir", "Thomas", "Umar", "Victor",
    "Wesley", "Xavier", "Yusuf", "Zachary",
)
_LAST_NAMES = (
    "Adams", "Brooks", "Cardoza", "Diaz", "Edwards", "Flores", "Garcia",
    "Hernandez", "Iyer", "Johnson", "Khan", "Lopez", "Martinez", "Nguyen",
    "O'Brien", "Park", "Quintero", "Reyes", "Singh", "Torres", "Underwood",
    "Velasquez", "Williams", "Xu", "Young", "Zaman",
)
_CITIES_NV = (
    ("Reno",       "NV", "89501"),
    ("Sparks",     "NV", "89431"),
    ("Carson City","NV", "89701"),
    ("Las Vegas",  "NV", "89101"),
    ("Henderson",  "NV", "89014"),
    ("Elko",       "NV", "89801"),
    ("Fernley",    "NV", "89408"),
)
_STREETS = (
    "Pine", "Maple", "Cedar", "Oak", "Elm", "Birch", "Willow", "Aspen",
    "Sage", "Mesquite", "Juniper", "Sierra",
)
_STREET_TYPES = ("St", "Ave", "Blvd", "Ln", "Dr", "Way")

_LANGUAGES = ("English", "English", "English", "Spanish", "Spanish", "Tagalog", "Vietnamese")
_CHANNELS = ("phone", "sms", "email", "email", "portal")
_LOB = ("Medicare Advantage", "Medicare Advantage", "Medicaid", "Commercial")
_PLAN_NAMES = (
    "Prominence Senior Plus HMO",
    "Prominence Senior Choice PPO",
    "Prominence Family Care",
    "Prominence Health Plus",
    "Prominence Medicaid Select",
)
_PCPS = (
    "Dr. Patel, Anjali",
    "Dr. Nguyen, Tran",
    "Dr. Robinson, Marcus",
    "Dr. Khan, Sarah",
    "Dr. Suarez, Mateo",
    "Dr. Lin, Wei",
    "Dr. Anderson, Heather",
)
_RISK_TIERS = ("low", "low", "low", "rising", "rising", "high", "high", "complex")

# (category, status_pool, billed_low, billed_high)
_CLAIM_CATEGORIES: tuple[tuple[str, tuple[str, ...], int, int], ...] = (
    ("pharmacy",          ("paid", "paid", "paid", "denied"),          15,    600),
    ("primary_care",      ("paid", "paid", "paid"),                    120,   480),
    ("specialist",        ("paid", "paid", "denied"),                  240,   1_200),
    ("lab",               ("paid", "paid"),                            45,    420),
    ("imaging",           ("paid", "paid", "denied"),                  280,   2_400),
    ("emergency",         ("paid", "paid", "denied"),                  900,   6_500),
    ("inpatient",         ("paid", "paid"),                            4_500, 38_000),
    ("outpatient_surgery",("paid", "paid", "denied"),                  2_200, 18_000),
)
_PROVIDERS = (
    "Renown Regional Medical Center", "Saint Mary's Health Network",
    "Carson Tahoe Health", "Northern Nevada Medical Center",
    "University Medical Center", "Sunrise Hospital", "Spring Valley Clinic",
    "Walgreens Pharmacy", "CVS Pharmacy", "Northern Nevada Imaging",
    "Sierra Cardiology", "High Desert Orthopedics",
)


# ── Generators ──────────────────────────────────────────────────────────────


def _gen_member(rng: random.Random, seq: int) -> dict:
    """Build the column dict for one m360_members row.

    ``seq`` is the 1-based position in the batch — used to make
    ``member_key`` unique and human-readable so it can be cross-referenced
    in the UI without exposing the autoincrement id.
    """
    gender = rng.choice(("F", "M"))
    first = rng.choice(_FIRST_NAMES_F if gender == "F" else _FIRST_NAMES_M)
    last = rng.choice(_LAST_NAMES)
    age = rng.randint(22, 88)
    dob = date.today().replace(year=date.today().year - age) - timedelta(days=rng.randint(0, 364))
    city, state, zip_ = rng.choice(_CITIES_NV)
    street_num = rng.randint(101, 9999)
    street_name = rng.choice(_STREETS)
    street_type = rng.choice(_STREET_TYPES)
    plan = rng.choice(_PLAN_NAMES)
    lob = rng.choice(_LOB)
    risk_tier = rng.choice(_RISK_TIERS)
    # Risk score correlates loosely with the tier — keeps the dataset
    # internally consistent for demo dashboards.
    base_score = {"low": 0.4, "rising": 0.9, "high": 1.6, "complex": 2.4}[risk_tier]
    composite = round(base_score + rng.uniform(-0.15, 0.35), 2)

    return {
        "member_key": f"PROM-{seq:04d}",
        "first_name": first,
        "last_name": last,
        "date_of_birth": dob,
        "gender": gender,
        "plan_name": plan,
        "line_of_business": lob,
        "phone": f"(775) 555-{rng.randint(100, 999):03d}{rng.randint(0, 9)}",
        "email": f"{first.lower()}.{last.lower().replace(chr(39), '')}{seq}@example.test",
        "address_line1": f"{street_num} {street_name} {street_type}",
        "address_city": city,
        "address_state": state,
        "address_zip": zip_,
        "preferred_language": rng.choice(_LANGUAGES),
        "preferred_channel": rng.choice(_CHANNELS),
        "primary_care_provider": rng.choice(_PCPS),
        "risk_score_composite": Decimal(str(composite)),
        "risk_tier": risk_tier,
        "clinical_risk_score": Decimal(str(round(composite + rng.uniform(-0.2, 0.2), 2))),
        "utilization_risk_score": Decimal(str(round(composite + rng.uniform(-0.2, 0.2), 2))),
        "cost_risk_score": Decimal(str(round(composite + rng.uniform(-0.3, 0.3), 2))),
        "engagement_risk_score": Decimal(str(round(rng.uniform(0.2, 1.5), 2))),
        "open_care_gaps": rng.randint(0, 4),
        "next_best_action": rng.choice((
            "Outreach for annual wellness visit",
            "Schedule HbA1c follow-up",
            "Confirm medication adherence",
            "Refer to care management",
            "Close open coding gaps",
        )),
        "last_interaction_at": datetime.now(timezone.utc) - timedelta(days=rng.randint(0, 180)),
    }


def _gen_claims_for_member(rng: random.Random, member_id: int, member_seq: int) -> Iterable[dict]:
    """Yield 5–8 claim dicts for a given member.

    Service dates span the last 12 months; categories are weighted toward
    primary_care / pharmacy / specialist so the distribution looks
    realistic without an outsized share of high-cost claims.
    """
    n = rng.randint(MIN_CLAIMS_PER_MEMBER, MAX_CLAIMS_PER_MEMBER)
    for i in range(1, n + 1):
        category, status_pool, billed_lo, billed_hi = rng.choice(_CLAIM_CATEGORIES)
        status = rng.choice(status_pool)
        billed = Decimal(str(round(rng.uniform(billed_lo, billed_hi), 2)))
        # Paid amount is 0 on denied claims; otherwise 60–95% of billed.
        if status == "denied":
            paid = Decimal("0.00")
            mem_resp = Decimal(str(round(float(billed) * rng.uniform(0.0, 0.25), 2)))
        else:
            paid_share = Decimal(str(round(rng.uniform(0.60, 0.95), 2)))
            paid = (billed * paid_share).quantize(Decimal("0.01"))
            mem_resp = (billed - paid).quantize(Decimal("0.01"))
        days_ago = rng.randint(1, 365)
        yield {
            "member_id": member_id,
            "claim_number": f"CLM-{member_seq:04d}-{i:02d}",
            "service_date": date.today() - timedelta(days=days_ago),
            "provider": rng.choice(_PROVIDERS),
            "category": category,
            "status": status,
            "billed_amount": billed,
            "paid_amount": paid,
            "member_responsibility": mem_resp,
        }


# ── Orchestration ──────────────────────────────────────────────────────────


def _tenant_database_url() -> str:
    """Resolve which tenant DB to write to. Mirrors the env wiring the
    existing Container App jobs use (``DEFAULT_TENANT_DATABASE_URL`` via
    Key Vault secretRef)."""
    uri = os.getenv("DEFAULT_TENANT_DATABASE_URL") or settings.DEFAULT_TENANT_DATABASE_URL
    if not uri:
        raise RuntimeError(
            "DEFAULT_TENANT_DATABASE_URL must be set. In Container App jobs this "
            "comes from the `tenant-db-url` Key Vault secret."
        )
    return uri


async def seed(target: int = TARGET_MEMBER_COUNT) -> dict:
    """Insert ``target - existing`` new members + their claims. Idempotent.

    Returns a small dict summarising what changed so the job log makes the
    end state obvious (existing count, inserted count, total claims).
    """
    load_all_models()
    rng = random.Random(RANDOM_SEED)

    engine = create_async_engine(_tenant_database_url(), future=True, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with Session() as session:
            existing = await session.scalar(select(func.count()).select_from(Member360Member))
            existing = int(existing or 0)
            if existing >= target:
                print(
                    f"[seed_prominence_demo] {existing} members already present "
                    f"(>= target {target}); nothing to do."
                )
                return {"existing": existing, "inserted_members": 0, "inserted_claims": 0}

            to_insert = target - existing
            print(
                f"[seed_prominence_demo] {existing} existing members; inserting "
                f"{to_insert} to reach target {target}."
            )

            # Insert members first so we have FK-able ids for the claims.
            new_members: list[Member360Member] = []
            for offset in range(1, to_insert + 1):
                row = _gen_member(rng, existing + offset)
                m = Member360Member(**row)
                session.add(m)
                new_members.append(m)
            await session.flush()  # populate primary keys

            inserted_claims = 0
            for m in new_members:
                seq = int(m.member_key.split("-")[-1])
                for claim_row in _gen_claims_for_member(rng, m.id, seq):
                    session.add(Member360Claim(**claim_row))
                    inserted_claims += 1

            await session.commit()

        print(
            f"[seed_prominence_demo] Done. Inserted {to_insert} members and "
            f"{inserted_claims} claims."
        )
        return {
            "existing": existing,
            "inserted_members": to_insert,
            "inserted_claims": inserted_claims,
        }
    finally:
        await engine.dispose()


def main() -> None:
    result = asyncio.run(seed())
    # Exit non-zero only on hard failure (caught by asyncio.run -> exception).
    # An idempotent no-op still returns 0 — that's the expected behaviour
    # for a job that runs on every deploy without re-doing work.
    print(result)


if __name__ == "__main__":
    main()
