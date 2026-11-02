"""Seed the Prominence tenant with a full Member360 demo dataset.

For each of 50 demo members the script generates:
  * 5-8 claims                (m360_claims)
  * 2-4 problems              (m360_problems, ICD-10 + HCC, correlated to risk tier)
  * 2-5 active medications    (m360_medications, with NDC + prescriber)
  * 3-6 lab observations      (m360_labs, LOINC-coded)
  * 1-3 risk insights         (m360_risk_insights)
  * 1-3 open tasks            (m360_tasks)
  * 1 accumulator row         (m360_accumulators)
  * 1 care journey            (m360_care_journeys + stages, for high/complex tier)

It is idempotent at the **per-table** level: each generator checks whether
the member already has rows in its target table and only inserts if the
member is empty. That means:

  * Running it once on a fresh tenant fills every table.
  * Running it again is a near no-op (a few SELECTs, no inserts).
  * If we later add a new generator to the script, the next run will fill
    that new table for the existing 50 members without touching the
    already-populated tables.

Data is produced from small vocabulary tuples + a seeded Random, so reruns
produce the same identities. No literal seed payloads (per the project's
seed-data convention — data belongs in the DB or in external files, never
inlined as a 50-row Python list).

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
      --trigger-type Manual --replica-timeout 600
    az containerapp job start  -g <rg> -n nexora-platform-seed-demo
"""
from __future__ import annotations

import asyncio
import os
import random
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings  # noqa: E402
from app.models import load_all_models  # noqa: E402
from app.models.coding import (  # noqa: E402
    CodingClaim,
    CodingMember,
    CodingMemberChase,
    CodingMemberPriority,
    CodingProvider,
    CodingProviderLocation,
)
from app.models.member360 import (  # noqa: E402
    Member360Accumulator,
    Member360CareJourney,
    Member360CareJourneyStage,
    Member360Claim,
    Member360Document,
    Member360Lab,
    Member360Medication,
    Member360Member,
    Member360Problem,
    Member360RiskInsight,
    Member360Task,
)
from app.models.dashboard_facts import (  # noqa: E402
    DashboardDeadlineBucket,
    DashboardFunnelContributor,
    DashboardFunnelStage,
    DashboardProviderMetric,
    DashboardRafMeta,
    DashboardRafSeriesPoint,
)
from app.models.ride_booking import (  # noqa: E402
    RideBooking,
    RidePartner,
    RidePartnerBillingProfile,
    RidePartnerSchedule,
    RidePaymentEvent,
    RidePaymentRecord,
    RideReconciliationItem,
)


# ── Configuration knobs ─────────────────────────────────────────────────────

TARGET_MEMBER_COUNT = 50
MIN_CLAIMS_PER_MEMBER = 5
MAX_CLAIMS_PER_MEMBER = 8

# Fixed seed so reruns produce the same synthetic dataset. Change to vary the
# generated identities; keep stable if you want reproducible demos.
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
# ── Provider catalogue ──────────────────────────────────────────────────────
# The set of providers that get seeded into ``coding_providers`` (the table
# the Provider app reads). Each member's ``primary_care_provider`` string
# field gets aligned to one of the ``is_pcp=True`` entries below so the
# Provider app shows providers that are actually attributed to members.
#
# NPIs are synthetic 10-digit strings beginning with a digit that isn't a
# valid NPI prefix (1-3), so they can't accidentally collide with a real
# provider's NPI in the wild. Each provider gets one Nevada location to
# match the member-base geography.
_PROVIDER_SEED: tuple[dict, ...] = (
    {"name": "Anjali Patel, MD",   "npi": "9700000001", "specialty": "Family Medicine",
     "phone": "(775) 555-1101", "email": "apatel@prominencehealth.com",
     "address_line1": "1500 Vista Blvd",   "city": "Sparks",      "state": "NV", "postal_code": "89431",
     "is_pcp": True},
    {"name": "Tran Nguyen, MD",    "npi": "9700000002", "specialty": "Family Medicine",
     "phone": "(775) 555-1102", "email": "tnguyen@prominencehealth.com",
     "address_line1": "200 N Sierra St",   "city": "Reno",        "state": "NV", "postal_code": "89501",
     "is_pcp": True},
    {"name": "Marcus Robinson, MD","npi": "9700000003", "specialty": "Internal Medicine",
     "phone": "(775) 555-1103", "email": "mrobinson@prominencehealth.com",
     "address_line1": "1155 Mill St",      "city": "Reno",        "state": "NV", "postal_code": "89502",
     "is_pcp": True},
    {"name": "Sarah Khan, MD",     "npi": "9700000004", "specialty": "Family Medicine",
     "phone": "(775) 555-1104", "email": "skhan@prominencehealth.com",
     "address_line1": "850 W 5th St",      "city": "Carson City", "state": "NV", "postal_code": "89703",
     "is_pcp": True},
    {"name": "Mateo Suarez, MD",   "npi": "9700000005", "specialty": "Internal Medicine",
     "phone": "(702) 555-1105", "email": "msuarez@prominencehealth.com",
     "address_line1": "3006 S Maryland Pkwy", "city": "Las Vegas", "state": "NV", "postal_code": "89109",
     "is_pcp": True},
    {"name": "Wei Lin, MD",        "npi": "9700000006", "specialty": "Family Medicine",
     "phone": "(702) 555-1106", "email": "wlin@prominencehealth.com",
     "address_line1": "1701 N Green Valley Pkwy", "city": "Henderson", "state": "NV", "postal_code": "89074",
     "is_pcp": True},
    {"name": "Heather Anderson, DO","npi": "9700000007", "specialty": "Family Medicine",
     "phone": "(775) 555-1107", "email": "handerson@prominencehealth.com",
     "address_line1": "555 Vista Knoll Pkwy", "city": "Reno",     "state": "NV", "postal_code": "89511",
     "is_pcp": True},
    # Specialists below — referenced for chases / risk insights, not assigned as PCPs.
    {"name": "Priya Iyer, MD",     "npi": "9700000008", "specialty": "Endocrinology",
     "phone": "(775) 555-1108", "email": "piyer@prominencehealth.com",
     "address_line1": "75 Pringle Way",    "city": "Reno",        "state": "NV", "postal_code": "89502",
     "is_pcp": False},
    {"name": "James Whitaker, MD", "npi": "9700000009", "specialty": "Cardiology",
     "phone": "(775) 555-1109", "email": "jwhitaker@prominencehealth.com",
     "address_line1": "343 Elm St",        "city": "Reno",        "state": "NV", "postal_code": "89503",
     "is_pcp": False},
    {"name": "Daniela Cardoza, MD","npi": "9700000010", "specialty": "Nephrology",
     "phone": "(775) 555-1110", "email": "dcardoza@prominencehealth.com",
     "address_line1": "1155 Mill St",      "city": "Reno",        "state": "NV", "postal_code": "89502",
     "is_pcp": False},
    {"name": "Felix Brooks, MD",   "npi": "9700000011", "specialty": "Pulmonology",
     "phone": "(702) 555-1111", "email": "fbrooks@prominencehealth.com",
     "address_line1": "10001 S Eastern Ave","city": "Henderson",  "state": "NV", "postal_code": "89052",
     "is_pcp": False},
    {"name": "Zoe Williams, MD",   "npi": "9700000012", "specialty": "Psychiatry",
     "phone": "(775) 555-1112", "email": "zwilliams@prominencehealth.com",
     "address_line1": "480 Galletti Way",  "city": "Sparks",      "state": "NV", "postal_code": "89431",
     "is_pcp": False},
)


# ── Coding vocabulary ───────────────────────────────────────────────────────
# (icd10, hcc, description) tuples the coding generator samples to build open
# chases and supporting claims. Vocabulary primitives, not row payloads.
_CODING_CONDITIONS = (
    ("E11.9", "HCC18",  "Type 2 diabetes mellitus without complications"),
    ("I10",   "HCC161", "Essential (primary) hypertension"),
    ("N18.4", "HCC138", "Chronic kidney disease, stage 4"),
    ("J44.1", "HCC111", "COPD with acute exacerbation"),
    ("I50.9", "HCC226", "Heart failure, unspecified"),
    ("F32.9", "HCC155", "Major depressive disorder, single episode"),
)
_CLAIM_TYPES = ("professional", "professional", "outpatient", "inpatient")


# ── Dashboard fact vocabulary ───────────────────────────────────────────────
_DASHBOARD_LOBS = ("MA",)
_FUNNEL_STAGES = ("suspected", "coder_reviewed", "accepted", "submitted", "payer_accepted", "on_score")
_DEADLINE_RANGES = ("0-3", "4-7", "8-14", "15-30", "30+")
_DEADLINE_WEIGHTS = (0.18, 0.24, 0.26, 0.20, 0.12)
_HEATMAP_METRICS = ("open_raf", "denial_rate", "days_aging", "qa_fail_rate")
_RAF_BREAKDOWN_GROUPS = ("All", "Accountable Care", "Independent", "Hospital-owned")
_FALLBACK_HEATMAP_PROVIDERS = (
    "Atlas Medical Group", "North Valley IPA", "Community Care Collaborative",
    "Prime Health Associates", "Summit Family Practice", "Vista Specialists Network",
)


def _heatmap_value(metric: str, rng: random.Random) -> float:
    if metric == "open_raf":
        return round(rng.uniform(120, 200), 1)
    if metric == "denial_rate":
        return round(rng.uniform(0.05, 0.17), 3)
    if metric == "days_aging":
        return round(rng.uniform(12, 37), 1)
    return round(rng.uniform(0.04, 0.14), 3)  # qa_fail_rate


# ── Ride-booking vocabulary ─────────────────────────────────────────────────
# Named transportation vendors (vocabulary primitives, like the provider
# catalogue) plus small tuples the generator samples to build schedules,
# rides, and payment rows. No literal multi-row payloads — see module docstring.
_RIDE_PARTNER_SEED: tuple[dict, ...] = (
    {"company_name": "Uber Health",      "contact_name": "Dispatch Desk",   "contact_email": "health@uber.example",        "contact_phone": "(800) 555-2001"},
    {"company_name": "Lyft Assist",      "contact_name": "Care Rides Team",  "contact_email": "assist@lyft.example",        "contact_phone": "(800) 555-2002"},
    {"company_name": "MedTrans Nevada",  "contact_name": "Ops Center",       "contact_email": "ops@medtrans-nv.example",    "contact_phone": "(775) 555-2003"},
    {"company_name": "Silver State NEMT","contact_name": "Scheduling",       "contact_email": "schedule@silverstate.example","contact_phone": "(702) 555-2004"},
)
_RIDE_DESTINATIONS = (
    "Renown Primary Care", "Carson Medical Group", "Northern NV Dialysis",
    "Sierra Imaging Center", "Las Vegas Cardiology", "Henderson Family Clinic",
)
# Weighted toward completed/queued so the demo shows a realistic mix.
_RIDE_STATUSES = ("completed", "completed", "queued", "scheduled", "in_progress", "cancelled")
_RECON_ITEMS = (
    ("Mismatched fare on completed ride", "high"),
    ("Missing receipt for subscriber invoice", "medium"),
    ("Duplicate payout flagged for review", "low"),
)


def _pcp_names() -> tuple[str, ...]:
    """Names of PCP-eligible providers — used to assign PCPs to members."""
    return tuple(p["name"] for p in _PROVIDER_SEED if p["is_pcp"])


def _all_provider_names() -> tuple[str, ...]:
    return tuple(p["name"] for p in _PROVIDER_SEED)


# Legacy alias for any in-script references; resolves to the PCP-eligible
# subset of the seeded provider catalogue.
_PCPS = _pcp_names()
_RISK_TIERS = ("low", "low", "low", "rising", "rising", "high", "high", "complex")


def _naive_utcnow() -> datetime:
    """Return a naive (no tzinfo) UTC datetime.

    The Member360 model uses ``DateTime`` (without ``timezone=True``) for
    ``last_interaction_at`` and ``Member360CareJourneyStage.completed_at``.
    Postgres + asyncpg rejects aware datetimes for those columns ("can't
    subtract offset-naive and offset-aware datetimes"). SQLite tolerates
    the mix, which is why the local smoke test passed but the first
    Container App job execution against Postgres did not.

    We use the modern ``datetime.now(tz).replace(tzinfo=None)`` idiom
    instead of the deprecated ``datetime.utcnow()`` so the script keeps
    working on Python 3.13+.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)

# Claim categories with status weighting and billed-amount ranges. Lower-
# acuity categories get higher weight so the dataset doesn't end up dominated
# by inpatient stays.
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


# Conditions per risk tier. The first tuple element is the ICD-10 code, the
# second is the human-readable label. The script picks 2-4 entries per
# member from the appropriate tier's pool so the diagnosis list reads
# plausibly (a "complex" member doesn't just have one cold).
_CONDITIONS_BY_TIER: dict[str, tuple[tuple[str, str, str], ...]] = {
    # (icd10, description, severity)
    "low": (
        ("I10",    "Essential hypertension", "mild"),
        ("E78.5",  "Hyperlipidemia, unspecified", "mild"),
        ("Z00.00", "General adult medical examination", "mild"),
        ("M54.5",  "Low back pain", "mild"),
    ),
    "rising": (
        ("I10",     "Essential hypertension", "moderate"),
        ("E78.5",   "Hyperlipidemia, unspecified", "moderate"),
        ("E66.9",   "Obesity, unspecified", "moderate"),
        ("F32.9",   "Major depressive disorder, single episode, unspecified", "moderate"),
        ("J45.909", "Unspecified asthma, uncomplicated", "moderate"),
    ),
    "high": (
        ("E11.9",   "Type 2 diabetes mellitus without complications", "moderate"),
        ("I10",     "Essential hypertension", "moderate"),
        ("I25.10",  "Atherosclerotic heart disease, native coronary artery", "moderate"),
        ("J44.9",   "Chronic obstructive pulmonary disease, unspecified", "moderate"),
        ("N18.3",   "Chronic kidney disease, stage 3", "moderate"),
        ("E78.5",   "Hyperlipidemia, unspecified", "moderate"),
    ),
    "complex": (
        ("E11.65",  "Type 2 diabetes mellitus with hyperglycemia", "severe"),
        ("I50.32",  "Chronic diastolic (congestive) heart failure", "severe"),
        ("N18.4",   "Chronic kidney disease, stage 4", "severe"),
        ("J44.1",   "COPD with (acute) exacerbation", "severe"),
        ("I25.10",  "Atherosclerotic heart disease", "severe"),
        ("F33.2",   "Major depressive disorder, recurrent, severe", "moderate"),
    ),
}

# (drug name, generic, dose, dose_unit, route, frequency, indication_icd10)
# ``indication_icd10`` lets us prefer meds whose indication matches one of
# the member's problems so the clinical story is internally consistent.
_MEDS: tuple[tuple[str, str, str, str, str, str, str], ...] = (
    ("Lisinopril 20mg", "lisinopril", "20", "mg", "PO", "once daily", "I10"),
    ("Amlodipine 10mg", "amlodipine", "10", "mg", "PO", "once daily", "I10"),
    ("Metformin 1000mg", "metformin",  "1000", "mg", "PO", "twice daily", "E11.9"),
    ("Atorvastatin 40mg", "atorvastatin", "40", "mg", "PO", "once daily at bedtime", "E78.5"),
    ("Aspirin 81mg", "aspirin", "81", "mg", "PO", "once daily", "I25.10"),
    ("Furosemide 40mg", "furosemide", "40", "mg", "PO", "once daily", "I50.32"),
    ("Albuterol HFA", "albuterol", "90", "mcg", "INH", "every 4-6 hours as needed", "J44.9"),
    ("Sertraline 50mg", "sertraline", "50", "mg", "PO", "once daily", "F32.9"),
    ("Insulin glargine 100u/ml", "insulin glargine", "10", "units", "SC", "once daily at bedtime", "E11.65"),
    ("Levothyroxine 75mcg", "levothyroxine", "75", "mcg", "PO", "once daily on empty stomach", ""),
    ("Omeprazole 20mg", "omeprazole", "20", "mg", "PO", "once daily before breakfast", ""),
)
_PHARMACIES = ("Walgreens", "CVS Pharmacy", "Smith's Pharmacy", "Costco Pharmacy", "Mail Order")


# (loinc, test name, unit, low ref, high ref, abnormal-bias-by-tier)
# The abnormal-bias map says: how likely is this lab to come back abnormal
# for each risk tier. Used to weight result generation so a diabetic's
# HbA1c is statistically higher than a low-risk member's.
_LAB_DEFS: tuple[dict, ...] = (
    {
        "loinc": "4548-4", "name": "Hemoglobin A1c", "unit": "%",
        "low": 4.0, "high": 5.6,
        "tier_target": {"low": (4.8, 5.4), "rising": (5.5, 6.2), "high": (6.5, 8.5), "complex": (8.0, 11.0)},
    },
    {
        "loinc": "2093-3", "name": "Total cholesterol", "unit": "mg/dL",
        "low": 100, "high": 199,
        "tier_target": {"low": (140, 195), "rising": (170, 220), "high": (190, 260), "complex": (200, 290)},
    },
    {
        "loinc": "2089-1", "name": "LDL cholesterol", "unit": "mg/dL",
        "low": 0, "high": 99,
        "tier_target": {"low": (70, 100), "rising": (95, 130), "high": (110, 165), "complex": (130, 200)},
    },
    {
        "loinc": "2160-0", "name": "Creatinine", "unit": "mg/dL",
        "low": 0.7, "high": 1.3,
        "tier_target": {"low": (0.8, 1.1), "rising": (0.9, 1.3), "high": (1.2, 2.1), "complex": (1.6, 3.2)},
    },
    {
        "loinc": "33914-3", "name": "Estimated GFR", "unit": "mL/min/1.73m2",
        "low": 60, "high": 120,
        "tier_target": {"low": (75, 105), "rising": (60, 90), "high": (35, 60), "complex": (18, 40)},
    },
    {
        "loinc": "2345-7", "name": "Glucose", "unit": "mg/dL",
        "low": 70, "high": 99,
        "tier_target": {"low": (78, 96), "rising": (90, 115), "high": (105, 180), "complex": (140, 260)},
    },
    {
        "loinc": "718-7", "name": "Hemoglobin", "unit": "g/dL",
        "low": 12.0, "high": 17.5,
        "tier_target": {"low": (13.5, 15.5), "rising": (12.8, 15.0), "high": (11.5, 14.0), "complex": (9.5, 12.5)},
    },
)


# Risk-insight templates. (domain, driver, recommendation)
_RISK_INSIGHTS_TEMPLATES = (
    ("clinical",    "Uncontrolled HbA1c with last result above goal",      "Schedule diabetes follow-up within 2 weeks."),
    ("clinical",    "Recent ED visit indicating acute care risk",          "Care manager outreach within 48 hours."),
    ("clinical",    "Hypertensive readings trending up over last quarter", "Schedule BP recheck and medication review."),
    ("clinical",    "Multiple chronic conditions requiring coordination",  "Enroll in chronic condition management program."),
    ("utilization", "PCP visit gap exceeds 12 months",                     "Outreach to schedule annual wellness visit."),
    ("utilization", "Frequent specialist visits without PCP coordination", "Care navigation referral."),
    ("cost",        "Pharmacy spend trending up year-over-year",           "Medication review for therapeutic alternatives."),
    ("engagement",  "Low portal engagement and missed digital reminders",  "Switch outreach channel to phone."),
)


# Task templates. (title, priority, sbar_situation, recommended_next_action)
_TASK_TEMPLATES = (
    ("Annual wellness visit overdue",        "medium", "Member has not completed AWV in the past 12 months.",
     "Schedule AWV with PCP."),
    ("HbA1c follow-up due",                  "high",   "Last HbA1c above goal; quarterly recheck due.",
     "Order HbA1c and book MD review."),
    ("Medication reconciliation needed",     "medium", "Multiple new prescriptions across providers.",
     "Schedule pharmacist consult."),
    ("Care plan review",                     "low",    "Annual care plan refresh approaching.",
     "Care manager to schedule review call."),
    ("Post-discharge follow-up",             "high",   "Discharged from inpatient stay 5 days ago.",
     "Confirm meds, schedule 7-day follow-up visit."),
    ("Close care gap: colorectal screening", "medium", "Screening overdue per USPSTF schedule.",
     "Order or schedule appropriate screening."),
)
_TASK_QUEUES = ("care_management", "coding", "outreach", "pharmacy")
_TASK_ASSIGNEES = (None, "care.team@prominencehealth.com", "outreach@prominencehealth.com")


# Care journeys by risk tier. (name, description, stages...)
_CARE_JOURNEYS_BY_TIER: dict[str, tuple[tuple[str, str, tuple[str, ...]], ...]] = {
    "high": (
        ("Diabetes self-management",
         "Quarterly cadence: A1c, foot exam, retinopathy screen, medication review.",
         ("Initial assessment", "A1c + labs ordered", "Medication review", "Education session", "Outcomes review")),
        ("Hypertension control",
         "Bi-monthly cadence focused on BP control and adherence.",
         ("Baseline BP check", "Medication titration", "Lifestyle counselling", "Outcomes review")),
    ),
    "complex": (
        ("Heart-failure 30-day discharge",
         "Post-acute care journey for newly-discharged CHF members.",
         ("Discharge intake", "Medication reconciliation", "Cardiology follow-up", "30-day outcomes")),
        ("CKD stage 3-4 coordination",
         "Multidisciplinary support: nephrology, nutrition, medication safety.",
         ("Nephrology consult", "Nutrition assessment", "Medication safety review", "Quarterly labs")),
    ),
}


# ── Member generator ───────────────────────────────────────────────────────


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
    # Risk score correlates loosely with the tier so demo dashboards have
    # internally consistent data.
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
        "last_interaction_at": _naive_utcnow() - timedelta(days=rng.randint(0, 180)),
    }


# ── Per-member generators (rng deterministic per member id) ────────────────
#
# Each generator below takes a member-scoped rng so reruns produce the same
# clinical story for a given member regardless of which other members already
# have data. We derive the per-member rng inside ``seed()`` as
# ``random.Random(RANDOM_SEED + member.id * 31 + table_offset)``.


def _gen_claims_for_member(rng: random.Random, member_id: int, member_seq: int) -> Iterable[dict]:
    n = rng.randint(MIN_CLAIMS_PER_MEMBER, MAX_CLAIMS_PER_MEMBER)
    for i in range(1, n + 1):
        category, status_pool, billed_lo, billed_hi = rng.choice(_CLAIM_CATEGORIES)
        status = rng.choice(status_pool)
        billed = Decimal(str(round(rng.uniform(billed_lo, billed_hi), 2)))
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


def _gen_problems_for_member(rng: random.Random, member: Member360Member) -> Iterable[dict]:
    tier = member.risk_tier or "low"
    pool = list(_CONDITIONS_BY_TIER.get(tier, _CONDITIONS_BY_TIER["low"]))
    rng.shuffle(pool)
    n = rng.randint(2, min(4, len(pool)))
    for idx, (code, desc, severity) in enumerate(pool[:n]):
        onset_days = rng.randint(60, 1500)
        yield {
            "member_id": member.id,
            "code": code,
            "code_system": "ICD-10",
            "description": desc,
            "status": "active",
            "severity": severity,
            "is_primary": idx == 0,
            "onset_date": date.today() - timedelta(days=onset_days),
            "recorded_by": member.primary_care_provider,
        }


def _gen_medications_for_member(
    rng: random.Random,
    member: Member360Member,
    problem_codes: list[str],
) -> Iterable[dict]:
    # Prefer medications whose indication matches one of the member's
    # problems so the clinical story is internally consistent. Top up with
    # random meds if the indication-matched pool is small.
    relevant = [m for m in _MEDS if m[6] and m[6] in problem_codes]
    other = [m for m in _MEDS if m not in relevant]
    rng.shuffle(other)
    rng.shuffle(relevant)
    pool = relevant + other
    n = rng.randint(2, 5)
    for i, (drug, generic, dose, unit, route, freq, _ind) in enumerate(pool[:n], start=1):
        start = date.today() - timedelta(days=rng.randint(30, 900))
        last_fill = date.today() - timedelta(days=rng.randint(0, 60))
        yield {
            "member_id": member.id,
            "rx_number": f"RX-{member.id:05d}-{i:02d}",
            "ndc_code": f"{rng.randint(10000, 99999)}-{rng.randint(1000, 9999)}-{rng.randint(10, 99)}",
            "drug_name": drug,
            "generic_name": generic,
            "dose": dose,
            "dose_unit": unit,
            "route": route,
            "frequency": freq,
            "days_supply": rng.choice((30, 30, 30, 60, 90)),
            "refills_remaining": rng.randint(0, 5),
            "prescriber": member.primary_care_provider,
            "pharmacy": rng.choice(_PHARMACIES),
            "start_date": start,
            "last_fill_date": last_fill,
            "status": "active",
        }


def _gen_labs_for_member(rng: random.Random, member: Member360Member) -> Iterable[dict]:
    tier = member.risk_tier or "low"
    pool = list(_LAB_DEFS)
    rng.shuffle(pool)
    n = rng.randint(3, 6)
    for lab in pool[:n]:
        target = lab["tier_target"].get(tier, lab["tier_target"]["low"])
        value = round(rng.uniform(*target), 1)
        abnormal = None
        if value < lab["low"]:
            abnormal = "L"
        elif value > lab["high"]:
            abnormal = "H"
        result_date = date.today() - timedelta(days=rng.randint(7, 270))
        yield {
            "member_id": member.id,
            "loinc_code": lab["loinc"],
            "test_name": lab["name"],
            "result_value": str(value),
            "result_unit": lab["unit"],
            "reference_range_low": lab["low"],
            "reference_range_high": lab["high"],
            "abnormal_flag": abnormal,
            "result_date": result_date,
            "ordering_provider": member.primary_care_provider,
            "performing_lab": rng.choice(("Quest Diagnostics", "LabCorp", "Renown Lab")),
            "status": "final",
        }


def _gen_risk_insights_for_member(rng: random.Random, member: Member360Member) -> Iterable[dict]:
    pool = list(_RISK_INSIGHTS_TEMPLATES)
    rng.shuffle(pool)
    n = rng.randint(1, 3)
    for domain, driver, recommendation in pool[:n]:
        # Score the insight using the member's risk for that domain, where
        # available. Falls back to composite for the catch-all domain.
        domain_score = {
            "clinical":   member.clinical_risk_score,
            "utilization": member.utilization_risk_score,
            "cost":        member.cost_risk_score,
            "engagement":  member.engagement_risk_score,
        }.get(domain) or member.risk_score_composite or 0
        score = float(domain_score) + rng.uniform(-0.1, 0.1)
        yield {
            "member_id": member.id,
            "domain": domain,
            "score": round(score, 2),
            "driver": driver,
            "recommendation": recommendation,
            "confidence": round(rng.uniform(0.55, 0.95), 2),
        }


def _gen_tasks_for_member(rng: random.Random, member: Member360Member) -> Iterable[dict]:
    pool = list(_TASK_TEMPLATES)
    rng.shuffle(pool)
    n = rng.randint(1, 3)
    for title, priority, sbar_s, next_action in pool[:n]:
        due = date.today() + timedelta(days=rng.randint(-7, 30))
        status = rng.choice(("open", "open", "in_progress", "done"))
        yield {
            "member_id": member.id,
            "title": title,
            "description": next_action,
            "assigned_user": rng.choice(_TASK_ASSIGNEES),
            "assigned_queue": rng.choice(_TASK_QUEUES),
            "priority": priority,
            "status": status,
            "due_date": due,
            "sbar_situation": sbar_s,
            "sbar_background": f"Member is in the {member.risk_tier or 'unknown'} tier.",
            "sbar_assessment": "Action recommended based on guideline gap.",
            "sbar_recommendation": next_action,
            "recommended_next_action": next_action,
        }


def _gen_accumulator_for_member(rng: random.Random, member: Member360Member) -> dict:
    plan_year_start = date(date.today().year, 1, 1)
    deductible_total = Decimal(str(rng.choice((500, 1000, 1500, 2000, 3500))))
    deductible_met = (deductible_total * Decimal(str(round(rng.uniform(0.0, 1.0), 2)))).quantize(Decimal("0.01"))
    oop_max = deductible_total * Decimal("3")
    oop_met = (oop_max * Decimal(str(round(rng.uniform(0.0, 0.9), 2)))).quantize(Decimal("0.01"))
    return {
        "member_id": member.id,
        "deductible": deductible_total,
        "deductible_met": deductible_met,
        "out_of_pocket_max": oop_max,
        "out_of_pocket_met": oop_met,
        "plan_year_start": plan_year_start,
    }


def _gen_care_journey_for_member(
    rng: random.Random, member: Member360Member
) -> tuple[dict, list[dict]] | None:
    """Return (journey_row, stage_rows) or None if this tier shouldn't have one.

    Care journeys are reserved for high/complex risk tiers in the seed —
    they're a heavyweight workflow concept and dashboards expect a small
    population of active journeys, not 50.
    """
    tier = member.risk_tier or "low"
    if tier not in _CARE_JOURNEYS_BY_TIER:
        return None
    name, description, stage_names = rng.choice(_CARE_JOURNEYS_BY_TIER[tier])
    start = date.today() - timedelta(days=rng.randint(7, 90))
    journey = {
        "member_id": member.id,
        "name": name,
        "description": description,
        "status": "active",
        "created_by": "seed_prominence_demo",
        "assigned_to": "care.team@prominencehealth.com",
        "start_date": start,
        "target_completion_date": start + timedelta(days=120),
        "source": "demo_seed",
        "template_name": name,
    }
    # Mark the earliest stages as completed and the remainder pending so the
    # journey looks "in progress" rather than freshly created.
    progressed = rng.randint(0, max(0, len(stage_names) - 1))
    stages = []
    for i, sname in enumerate(stage_names):
        stages.append(
            {
                "sequence": i,
                "name": sname,
                "description": None,
                "status": "completed" if i < progressed else "pending",
                "completed_at": (
                    _naive_utcnow() - timedelta(days=rng.randint(1, 30))
                    if i < progressed
                    else None
                ),
            }
        )
    return journey, stages


_DOCUMENT_TEMPLATES: tuple[tuple[str, str, str, int], ...] = (
    ("HIPAA_Authorization_Care_Waiver", "Care Waiver", "application/pdf", 184320),
    ("Annual_Wellness_Care_Summary", "Care Summary", "application/pdf", 245760),
    ("Comprehensive_Metabolic_Panel_Results", "Lab Report", "application/pdf", 142600),
    ("Explanation_of_Benefits_Q1", "EOB", "application/pdf", 312400),
    ("Inpatient_Discharge_Summary", "Discharge Summary", "application/pdf", 428900),
    ("NEMT_Transportation_Consent_Waiver", "Care Waiver", "application/pdf", 118400),
)
_DOCUMENT_UPLOADERS = (
    "dr.chen@prominencehealth.com",
    "elena.nurse@prominencehealth.com",
    "coordinator@prominencehealth.com",
    "supervisor@prominencehealth.com",
)


def _gen_documents_for_member(
    rng: random.Random, member: Member360Member, member_seq: int
) -> Iterable[dict]:
    pool = list(_DOCUMENT_TEMPLATES)
    rng.shuffle(pool)
    n = 3 if member_seq == 1 else rng.randint(1, 3)
    for idx, (prefix, doc_type, mime, base_size) in enumerate(pool[:n], start=1):
        days_ago = rng.randint(1, 6) if idx == 1 else rng.randint(7, 120)
        status = "active" if idx <= 2 else rng.choice(("active", "active", "pending", "expired"))
        yield {
            "member_id": member.id,
            "file_name": f"{prefix}_PROM-{member_seq:04d}.pdf",
            "document_type": doc_type,
            "uploaded_by": rng.choice(_DOCUMENT_UPLOADERS),
            "uploaded_at": _naive_utcnow() - timedelta(days=days_ago, hours=rng.randint(1, 18)),
            "status": status,
            "content_type": mime,
            "size_bytes": base_size + rng.randint(-12000, 24000),
        }


# ── Orchestration helpers ──────────────────────────────────────────────────


def _per_member_rng(member_id: int, offset: int) -> random.Random:
    """Stable per-(member, table) RNG. ``offset`` is a small int chosen per
    generator so rerunning one generator doesn't shift the random stream of
    another."""
    return random.Random(RANDOM_SEED + member_id * 31 + offset)


async def _ensure_providers(session: AsyncSession) -> dict:
    """Insert the seeded provider catalogue if ``coding_providers`` is empty.

    Idempotent at the table level: any existing provider rows mean we
    leave the catalogue alone (operators may have curated the list and we
    shouldn't clobber that). Each new provider also gets one matching
    ``coding_provider_locations`` row.
    """
    existing = int(
        (await session.scalar(select(func.count()).select_from(CodingProvider))) or 0
    )
    if existing > 0:
        return {"providers_existing": existing, "providers_inserted": 0}

    inserted = 0
    for p in _PROVIDER_SEED:
        provider = CodingProvider(
            npi=p["npi"],
            name=p["name"],
            phone=p["phone"],
            email=p["email"],
        )
        session.add(provider)
        await session.flush()  # populate id for the location FK
        session.add(
            CodingProviderLocation(
                provider_id=provider.id,
                address_line1=p["address_line1"],
                city=p["city"],
                state=p["state"],
                postal_code=p["postal_code"],
            )
        )
        inserted += 1
    return {"providers_existing": 0, "providers_inserted": inserted}


async def _ensure_dashboard_facts(session: AsyncSession, rng: random.Random) -> dict:
    """Populate the dashboard_* fact tables (RAF delta, suspects funnel,
    deadline radar, provider heatmap) if they are empty.

    Idempotent at the table level (keyed on the funnel-stage table). Heatmap
    providers come from the seeded coding provider catalogue when present, else
    a fallback vocabulary, so the dashboard always renders. Model years cover
    the prior, current, and 2025 vintages so both the live UI default and the
    fixtures find data.
    """
    existing = int(
        (await session.scalar(select(func.count()).select_from(DashboardFunnelStage))) or 0
    )
    if existing > 0:
        return {"dashboard_funnel_stages_existing": existing, "dashboard_seeded": False}

    today = _naive_utcnow().date()
    model_years = sorted({today.year, today.year - 1, 2025})

    # ── RAF delta: meta + 30-day realized series + forecast points ───────────
    for my in model_years:
        for lob in _DASHBOARD_LOBS:
            target = round(rng.uniform(2.6, 4.2), 2)
            realized_total = round(target * rng.uniform(0.55, 0.8), 3)
            cutoff = date(my + 1, 1, 31)

            breakdown = []
            for idx, grp in enumerate(_RAF_BREAKDOWN_GROUPS):
                frac = 0.4 if idx == 0 else 0.2
                breakdown.append(
                    {"group": grp, "realized": round(max(0.0, realized_total * frac * rng.uniform(0.85, 1.1)), 3)}
                )
            session.add(
                DashboardRafMeta(
                    model_year=my, lob=lob, provider_group="All",
                    target=target, cutoff_date=cutoff, breakdown=breakdown,
                )
            )

            daily = [rng.uniform(0.4, 1.0) for _ in range(30)]
            total_weight = sum(daily) or 1.0
            cumulative = 0.0
            start = today - timedelta(days=29)
            for i in range(30):
                add = realized_total * daily[i] / total_weight
                cumulative += add
                session.add(
                    DashboardRafSeriesPoint(
                        model_year=my, lob=lob, provider_group="All",
                        as_of_date=start + timedelta(days=i),
                        realized=round(cumulative, 3), daily_add=round(add, 3), is_forecast=False,
                    )
                )

            projected = realized_total + (target - realized_total) * 0.85
            spread = max(0.05, projected * 0.08)
            for horizon in (cutoff - timedelta(days=21), cutoff - timedelta(days=14), cutoff - timedelta(days=7), cutoff):
                session.add(
                    DashboardRafSeriesPoint(
                        model_year=my, lob=lob, provider_group="All",
                        as_of_date=horizon, realized=0.0, daily_add=0.0, is_forecast=True,
                        realized_p50=round(projected, 3),
                        lo80=round(max(0.0, projected - spread), 3),
                        hi80=round(projected + spread, 3),
                    )
                )

    # ── Suspects funnel: stages + contributors ───────────────────────────────
    running = rng.randint(1200, 2000)
    for pos, stage in enumerate(_FUNNEL_STAGES):
        if pos > 0:
            running = int(running * rng.uniform(0.78, 0.92))
        session.add(
            DashboardFunnelStage(
                stage_key=stage, position=pos, count=running, median_days=round(rng.uniform(3, 7), 1)
            )
        )

    provider_names = list((await session.execute(select(CodingProvider.name))).scalars())
    heatmap_providers = (provider_names or list(_FALLBACK_HEATMAP_PROVIDERS))[:6]
    for name in rng.sample(heatmap_providers, k=min(5, len(heatmap_providers))):
        session.add(
            DashboardFunnelContributor(
                stage_key=rng.choice(_FUNNEL_STAGES), name=name, count=rng.randint(20, 160)
            )
        )

    # ── Deadline radar: buckets per stage ────────────────────────────────────
    for stage in _FUNNEL_STAGES:
        total_items = rng.randint(320, 560)
        for pos, (label, weight) in enumerate(zip(_DEADLINE_RANGES, _DEADLINE_WEIGHTS)):
            session.add(
                DashboardDeadlineBucket(
                    stage=stage, range_label=label, position=pos,
                    count=int(total_items * weight * rng.uniform(0.9, 1.1)),
                )
            )

    # ── Provider heatmap: value + 12-point sparkline per provider+metric ─────
    for lob in _DASHBOARD_LOBS:
        for provider in heatmap_providers:
            for metric in _HEATMAP_METRICS:
                value = _heatmap_value(metric, rng)
                sparkline = [round(_heatmap_value(metric, rng), 3) for _ in range(12)]
                session.add(
                    DashboardProviderMetric(
                        lob=lob, provider_group="All", provider=provider,
                        metric=metric, value=value, sparkline=sparkline,
                    )
                )

    return {
        "dashboard_seeded": True,
        "dashboard_model_years": model_years,
        "dashboard_heatmap_providers": len(heatmap_providers),
    }


async def _ensure_coding_demo(session: AsyncSession, rng: random.Random) -> dict:
    """Seed the Coding app (members + open chases + supporting claims) if
    ``coding_members`` is empty. Each member gets 1-2 open chases drawn from the
    HCC vocabulary; each open chase gets 2-4 claims whose diagnosis_codes
    include the chase's ICD-10 so the workbench surfaces qualifying evidence.

    Idempotent at the table level: any existing coding member means we leave the
    module alone. (The legacy ``coding_members.ensure_seed_data`` helper is not
    wired into any runtime path, so without this the coding tables stay empty.)
    """
    existing = int(
        (await session.scalar(select(func.count()).select_from(CodingMember))) or 0
    )
    if existing > 0:
        return {"coding_members_existing": existing, "coding_members_inserted": 0}

    provider_ids = list(
        (await session.execute(select(CodingProvider.id))).scalars()
    )
    pcp_names = list(_pcp_names())
    all_first = _FIRST_NAMES_F + _FIRST_NAMES_M
    today = _naive_utcnow().date()

    members_inserted = 0
    chases_inserted = 0
    claims_inserted = 0
    for seq in range(1, 9):  # 8 coding members
        city = rng.choice(_CITIES_NV)
        member = CodingMember(
            member_key=f"PH-{seq:04d}",
            first_name=rng.choice(all_first),
            last_name=rng.choice(_LAST_NAMES),
            status="active",
            line_of_business=rng.choice(("Medicare Advantage", "Medicare Advantage", "Commercial")),
            risk_score=round(rng.uniform(0.4, 1.6), 2),
            primary_language=rng.choice(_LANGUAGES),
            pcp_name=pcp_names[(seq - 1) % len(pcp_names)] if pcp_names else None,
            address_city=city[0],
            address_state=city[1],
        )
        session.add(member)
        await session.flush()  # id for chase/claim FKs
        members_inserted += 1

        conditions = rng.sample(_CODING_CONDITIONS, k=rng.randint(1, 2))
        # Risk-prioritization row so the /member/{id}/risk endpoint has data.
        session.add(
            CodingMemberPriority(
                member_id=member.id,
                priority_score=round(rng.uniform(0.4, 2.4), 2),
                priority_tier=rng.choice(("high", "normal", "low")),
                hcc_opportunity_count=len(conditions),
            )
        )
        for idx, (icd10, hcc, _desc) in enumerate(conditions, start=1):
            dos = today - timedelta(days=rng.randint(20, 300))
            session.add(
                CodingMemberChase(
                    member_id=member.id,
                    chase_code=f"PH-CH-{seq:04d}-{idx}",
                    status="open",
                    priority=rng.choice(("high", "normal", "normal", "low")),
                    icd10_code=icd10,
                    hcc_code=hcc,
                    service_date_from=dos,
                    due_date=today + timedelta(days=rng.randint(10, 60)),
                )
            )
            chases_inserted += 1

            for c in range(rng.randint(2, 4)):
                # First claim carries the chase ICD so evidence is "qualifying";
                # the rest add incidental codes for realism.
                primary = icd10 if c == 0 else rng.choice(_CODING_CONDITIONS)[0]
                extra = rng.choice(_CODING_CONDITIONS)[0]
                session.add(
                    CodingClaim(
                        member_id=member.id,
                        provider_id=rng.choice(provider_ids) if provider_ids else None,
                        claim_number=f"CLM-{seq:04d}-{idx}-{c}",
                        claim_type=rng.choice(_CLAIM_TYPES),
                        service_date=dos - timedelta(days=rng.randint(0, 30)),
                        diagnosis_codes={primary: "primary", extra: "secondary"},
                    )
                )
                claims_inserted += 1

    return {
        "coding_members_inserted": members_inserted,
        "coding_chases_inserted": chases_inserted,
        "coding_claims_inserted": claims_inserted,
    }


async def _ensure_ride_booking(session: AsyncSession, rng: random.Random) -> dict:
    """Seed the ride-booking module (partners + schedules + billing profiles +
    rides + payment records + reconciliation items + payment events).

    Idempotent at the table level: any existing ``ride_partners`` row means an
    operator has curated the data, so we leave the whole module alone. Rider
    identities are drawn from already-seeded Member360 members so member_ids
    are coherent across the demo; if none exist we fall back to the name
    vocabulary.
    """
    existing = int(
        (await session.scalar(select(func.count()).select_from(RidePartner))) or 0
    )
    if existing > 0:
        return {"ride_partners_existing": existing, "ride_partners_inserted": 0}

    today = _naive_utcnow().date()
    partners: list[RidePartner] = []
    for spec in _RIDE_PARTNER_SEED:
        partner = RidePartner(
            company_name=spec["company_name"],
            contact_name=spec["contact_name"],
            contact_email=spec["contact_email"],
            contact_phone=spec["contact_phone"],
            status="active",
        )
        session.add(partner)
        await session.flush()  # populate id for schedule/billing FKs
        partners.append(partner)

        freq = rng.choice(("daily", "weekly"))
        session.add(
            RidePartnerSchedule(
                partner_id=partner.id,
                frequency=freq,
                start_date=today - timedelta(days=30),
                end_date=today + timedelta(days=180),
                open_slots=rng.randint(3, 12),
                days_of_week=["mon", "tue", "wed", "thu", "fri"] if freq == "weekly" else [],
                days_of_month=[],
            )
        )
        session.add(
            RidePartnerBillingProfile(
                partner_id=partner.id,
                pay_to_name=spec["company_name"],
                payment_email=spec["contact_email"],
                payment_method=rng.choice(("ach", "check", "card")),
                remit_address=f"PO Box {rng.randint(1000, 9999)}, Reno, NV 89501",
                tax_id=f"{rng.randint(10, 99)}-{rng.randint(1000000, 9999999)}",
            )
        )

    members = list(
        (await session.execute(select(Member360Member).limit(20))).scalars()
    )
    all_first = _FIRST_NAMES_F + _FIRST_NAMES_M

    rides: list[RideBooking] = []
    for i in range(12):
        partner = rng.choice(partners)
        if members:
            m = rng.choice(members)
            member_id = m.member_key or f"PROM-{i:04d}"
            first, last = m.first_name, m.last_name
        else:
            member_id = f"PROM-{i:04d}"
            first, last = rng.choice(all_first), rng.choice(_LAST_NAMES)
        city = rng.choice(_CITIES_NV)
        sched = _naive_utcnow() + timedelta(days=rng.randint(-14, 14), hours=rng.randint(7, 17))
        cost = round(rng.uniform(12, 65), 2)
        ride = RideBooking(
            partner_id=partner.id,
            member_id=member_id,
            first_name=first,
            last_name=last,
            ride_type=partner.company_name,
            pickup="Home",
            pickup_address=f"{rng.randint(100, 9999)} {rng.choice(_STREETS)} {rng.choice(_STREET_TYPES)}, {city[0]}, {city[1]} {city[2]}",
            dropoff=rng.choice(_RIDE_DESTINATIONS),
            dropoff_address=f"{rng.randint(100, 9999)} {rng.choice(_STREETS)} {rng.choice(_STREET_TYPES)}, {city[0]}, {city[1]} {city[2]}",
            scheduled_pickup=sched,
            estimated_dropoff=sched + timedelta(minutes=rng.randint(20, 60)),
            cost_usd=cost,
            status=rng.choice(_RIDE_STATUSES),
            created_by="seed_prominence_demo",
        )
        session.add(ride)
        await session.flush()
        rides.append(ride)

    # Provider + subscriber payment records for each completed ride; the
    # subscriber share mirrors the route's 1.12x convention.
    payment_records = 0
    for ride in rides:
        if ride.status != "completed":
            continue
        session.add(
            RidePaymentRecord(
                ride_id=ride.id,
                payer_type="provider",
                counterparty_name=ride.ride_type,
                invoice_number=f"INV-{rng.randint(100000, 999999)}",
                amount_usd=ride.cost_usd or 0.0,
                status=rng.choice(("paid", "open", "open")),
            )
        )
        session.add(
            RidePaymentRecord(
                ride_id=ride.id,
                payer_type="subscriber",
                counterparty_name=f"{ride.first_name} {ride.last_name}",
                invoice_number=f"SUB-{rng.randint(100000, 999999)}",
                amount_usd=round((ride.cost_usd or 0.0) * 1.12, 2),
                status=rng.choice(("paid", "open")),
            )
        )
        payment_records += 2

    for title, priority in _RECON_ITEMS:
        session.add(
            RideReconciliationItem(
                title=title,
                detail="Auto-flagged during nightly reconciliation.",
                status="open",
                priority=priority,
            )
        )

    for _ in range(5):
        session.add(
            RidePaymentEvent(
                source=rng.choice(("uber", "lyft", "stripe", "manual")),
                event_type=rng.choice(
                    ("payout.created", "invoice.paid", "dispute.opened", "charge.succeeded")
                ),
                detail="Synthetic demo payment event.",
                payload={},
                event_at=_naive_utcnow() - timedelta(days=rng.randint(0, 10)),
            )
        )

    return {
        "ride_partners_inserted": len(partners),
        "rides_inserted": len(rides),
        "ride_payment_records_inserted": payment_records,
    }


async def _align_member_pcps(
    session: AsyncSession,
) -> int:
    """For each m360_member, if ``primary_care_provider`` is not one of the
    PCP-eligible seeded provider names, rewrite it to a deterministic pick.

    "Deterministic" = the assignment is keyed on member.id, so the same
    member always ends up with the same PCP across reruns (good for demo
    stability — a screenshot taken yesterday matches what's on screen
    today).

    Returns the number of members whose PCP string was changed.
    """
    pcp_names = list(_pcp_names())
    if not pcp_names:
        return 0
    members = list((await session.execute(select(Member360Member))).scalars())
    pcp_set = set(pcp_names)
    changes = 0
    for m in members:
        if (m.primary_care_provider or "") in pcp_set:
            continue
        # Stable round-robin: same member.id always picks the same PCP.
        m.primary_care_provider = pcp_names[(m.id - 1) % len(pcp_names)]
        changes += 1
    return changes


async def _ensure_members(
    session: AsyncSession, base_rng: random.Random, target: int
) -> dict:
    """Insert members until we hit ``target``. Returns counts."""
    existing = int(
        (await session.scalar(select(func.count()).select_from(Member360Member))) or 0
    )
    if existing >= target:
        return {"existing_members": existing, "inserted_members": 0}
    to_insert = target - existing
    print(
        f"[seed_prominence_demo] {existing} existing members; inserting "
        f"{to_insert} to reach target {target}."
    )
    for offset in range(1, to_insert + 1):
        row = _gen_member(base_rng, existing + offset)
        session.add(Member360Member(**row))
    await session.flush()
    return {"existing_members": existing, "inserted_members": to_insert}


async def _topup_table(
    session: AsyncSession,
    member: Member360Member,
    model_cls,
    *,
    fk_column: str,
    rows: Iterable[dict],
) -> int:
    """Generic top-up: if the member has zero rows in ``model_cls``, insert
    ``rows``. Returns count inserted (0 if the table already had data).
    """
    existing = int(
        (
            await session.scalar(
                select(func.count())
                .select_from(model_cls)
                .where(getattr(model_cls, fk_column) == member.id)
            )
        )
        or 0
    )
    if existing > 0:
        return 0
    count = 0
    for row in rows:
        session.add(model_cls(**row))
        count += 1
    return count


async def _topup_accumulator(session: AsyncSession, member: Member360Member) -> int:
    """Accumulator has a unique FK on member_id, so we can't add a second
    row — early-out if any row exists."""
    existing = int(
        (
            await session.scalar(
                select(func.count())
                .select_from(Member360Accumulator)
                .where(Member360Accumulator.member_id == member.id)
            )
        )
        or 0
    )
    if existing > 0:
        return 0
    row = _gen_accumulator_for_member(_per_member_rng(member.id, 6), member)
    session.add(Member360Accumulator(**row))
    return 1


async def _topup_care_journey(session: AsyncSession, member: Member360Member) -> int:
    """Insert a journey + its stages atomically. Skips if any journey row
    already exists for the member."""
    existing = int(
        (
            await session.scalar(
                select(func.count())
                .select_from(Member360CareJourney)
                .where(Member360CareJourney.member_id == member.id)
            )
        )
        or 0
    )
    if existing > 0:
        return 0
    result = _gen_care_journey_for_member(_per_member_rng(member.id, 7), member)
    if result is None:
        return 0
    journey_row, stage_rows = result
    journey = Member360CareJourney(**journey_row)
    session.add(journey)
    await session.flush()
    for stage_row in stage_rows:
        session.add(Member360CareJourneyStage(journey_id=journey.id, **stage_row))
    return 1 + len(stage_rows)


# ── Public entry ──────────────────────────────────────────────────────────


def _tenant_database_url() -> str:
    uri = os.getenv("DEFAULT_TENANT_DATABASE_URL") or settings.DEFAULT_TENANT_DATABASE_URL
    if not uri:
        raise RuntimeError(
            "DEFAULT_TENANT_DATABASE_URL must be set. In Container App jobs this "
            "comes from the `tenant-db-url` Key Vault secret."
        )
    return uri


async def seed(target: int = TARGET_MEMBER_COUNT) -> dict:
    """Fill the Prominence tenant. Returns a summary dict."""
    load_all_models()
    base_rng = random.Random(RANDOM_SEED)

    engine = create_async_engine(_tenant_database_url(), future=True, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    summary: dict = {}

    try:
        async with Session() as session:
            # 0) Seed the provider catalogue first. New members generated in
            #    step 1 will draw their PCP from the seeded provider names,
            #    and existing members get re-aligned in step 1.5.
            summary.update(await _ensure_providers(session))
            await session.flush()

            # 1) Ensure 50 members exist.
            summary.update(await _ensure_members(session, base_rng, target))
            await session.flush()

            # 1.5) Rewrite stale primary_care_provider strings on members
            #      whose value isn't a seeded PCP (legacy rows from earlier
            #      seed versions). Same member.id always picks the same PCP.
            summary["pcp_realigned"] = await _align_member_pcps(session)
            await session.flush()

            # 2) Iterate every member and top up the child tables.
            all_members = list(
                (await session.execute(select(Member360Member))).scalars()
            )

            counts = {
                "claims": 0,
                "problems": 0,
                "medications": 0,
                "labs": 0,
                "risk_insights": 0,
                "tasks": 0,
                "accumulators": 0,
                "care_journey_rows": 0,
                "documents": 0,
            }

            for m in all_members:
                seq = int((m.member_key or "PROM-0000").rsplit("-", 1)[-1] or 0)

                # Problems first — meds use the problem codes for indication
                # matching, so we generate problems before medications.
                counts["problems"] += await _topup_table(
                    session, m, Member360Problem,
                    fk_column="member_id",
                    rows=_gen_problems_for_member(_per_member_rng(m.id, 1), m),
                )

                # Re-read the member's current problems (just-inserted ones
                # are in the session but not flushed yet — we use the rng's
                # determinism instead to keep med generation in sync).
                problem_codes = [
                    c for c, _d, _s in _CONDITIONS_BY_TIER.get(m.risk_tier or "low", ())
                ]

                counts["claims"] += await _topup_table(
                    session, m, Member360Claim,
                    fk_column="member_id",
                    rows=_gen_claims_for_member(_per_member_rng(m.id, 2), m.id, seq),
                )
                counts["medications"] += await _topup_table(
                    session, m, Member360Medication,
                    fk_column="member_id",
                    rows=_gen_medications_for_member(
                        _per_member_rng(m.id, 3), m, problem_codes
                    ),
                )
                counts["labs"] += await _topup_table(
                    session, m, Member360Lab,
                    fk_column="member_id",
                    rows=_gen_labs_for_member(_per_member_rng(m.id, 4), m),
                )
                counts["risk_insights"] += await _topup_table(
                    session, m, Member360RiskInsight,
                    fk_column="member_id",
                    rows=_gen_risk_insights_for_member(_per_member_rng(m.id, 5), m),
                )
                counts["tasks"] += await _topup_table(
                    session, m, Member360Task,
                    fk_column="member_id",
                    rows=_gen_tasks_for_member(_per_member_rng(m.id, 8), m),
                )
                counts["accumulators"] += await _topup_accumulator(session, m)
                counts["care_journey_rows"] += await _topup_care_journey(session, m)
                counts["documents"] += await _topup_table(
                    session, m, Member360Document,
                    fk_column="member_id",
                    rows=_gen_documents_for_member(_per_member_rng(m.id, 9), m, seq),
                )

            # 3) Coding app (members + open chases + qualifying claims) so the
            #    coding worklist and workbench have real data to operate on.
            summary.update(
                await _ensure_coding_demo(session, random.Random(RANDOM_SEED + 55))
            )

            # 4) Dashboard fact tables (RAF / funnel / deadline / heatmap).
            summary.update(
                await _ensure_dashboard_facts(session, random.Random(RANDOM_SEED + 33))
            )

            # 5) Ride-booking module (partners/rides/payments). Seeded after
            #    members so rider identities reference real member keys.
            summary.update(
                await _ensure_ride_booking(session, random.Random(RANDOM_SEED + 99))
            )

            await session.commit()
            summary["topups"] = counts

        print(f"[seed_prominence_demo] Done. Summary: {summary}")
        return summary
    finally:
        await engine.dispose()


def main() -> None:
    result = asyncio.run(seed())
    print(result)


if __name__ == "__main__":
    main()
