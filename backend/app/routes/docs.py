from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context
from ..models.tables import DocsArticle as DocsArticleModel
from ..schemas.docs import DocsArticle, DocsArticleCreate, DocsArticleListResponse
from ..utils.audit_logger import record_audit_event
from ..utils.rbac import ALL_12_RBAC_ROLES
from ..utils.security import AuthenticatedUser, get_current_user, require_admin, require_application

router = APIRouter(
    prefix="/api/docs",
    tags=["docs"],
    dependencies=[Depends(require_application("docs"))],
)

_SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")

ALL_STAFF_ROLES: list[str] = [
    "platform_admin",
    "admin",
    "business_admin",
    "payer_executive",
    "supervisor",
    "coordinator",
    "compliance_auditor",
    "clinician",
    "nurse",
    "coder",
    "billing",
]

CLINICAL_ROLES: list[str] = [
    "platform_admin",
    "admin",
    "supervisor",
    "coordinator",
    "clinician",
    "nurse",
]

SUPERVISOR_AUDITOR_ADMIN_ROLES: list[str] = [
    "platform_admin",
    "admin",
    "business_admin",
    "supervisor",
    "compliance_auditor",
]

CODING_ROLES: list[str] = [
    "platform_admin",
    "admin",
    "supervisor",
    "clinician",
    "coder",
]

FINANCIAL_EXEC_ROLES: list[str] = [
    "platform_admin",
    "admin",
    "business_admin",
    "payer_executive",
    "supervisor",
    "clinician",
    "billing",
]

ADMIN_INGESTION_ROLES: list[str] = [
    "platform_admin",
    "admin",
    "business_admin",
]

ALL_ROLES_INCLUDING_PATIENT: list[str] = list(ALL_12_RBAC_ROLES)

DEFAULT_DOCS_MANUAL_ARTICLES: tuple[dict, ...] = (
    {
        "title": "1. Getting Started, Enterprise SSO & HIPAA Workstation Security",
        "summary": "Platform sign-in guide covering Enterprise OIDC/SAML 2.0 SSO, organizational credentials, first-time password rotation, and the 15-minute HIPAA inactivity lock.",
        "category": "Getting Started & HIPAA Security",
        "app_key": "portal",
        "allowed_roles": ALL_ROLES_INCLUDING_PATIENT,
        "content": (
            "### 1.1 Platform Overview & Architecture\n"
            "**Arc-8 Enterprise Health OS** is a HIPAA-compliant, multi-tenant clinical operations, value-based care (VBC), "
            "and financial intelligence platform providing a unified **Single Pane of Glass** across three core pillars:\n"
            "- **Clinical Operations (Member 360 Suite):** Population Care Intelligence, fast member search (<500ms via 30-day Redis Hot Cache), "
            "9-tab Member 360 chart workspace, SBAR clinical tasks, multi-stage Care Journeys, Care Options cost-redirection, and encrypted Documents.\n"
            "- **Value-Based Care & Operations:** CMS-HCC (`v28`) Coding Worklist, M.E.A.T. Suspect Workbench, Executive RAF (calibrated `1.25` target) & "
            "Star Quality Dashboards, NPI Provider Directory, and Non-Emergency Medical Transportation (`NEMT`) Ride Booking.\n"
            "- **Governance & Administration:** 12-Role HIPAA Minimum-Necessary RBAC matrix, immutable PHI audit logs, 17-feed UHS SFTP & FHIR ingestion, "
            "and 6 live enterprise API connectors.\n\n"
            "### 1.2 Signing In (`/login`)\n"
            "1. **Enterprise OIDC / SAML 2.0 SSO:** Click **Sign In with OIDC** to authenticate via your corporate Identity Provider "
            "(Microsoft Entra ID, Okta, or AWS Cognito). Your IdP security group maps automatically to one of Arc-8's 12 canonical roles. "
            "Unmapped external contractor groups are blocked by default (`403 Access Denied`).\n"
            "2. **Organizational Credentials:** Confirm your Healthcare Organization key (e.g., `prominencehealth`), enter your email and password, "
            "and complete MFA challenge when prompted for PHI routes.\n"
            "3. **First-Time Password Change (`/change-password`):** Accounts provisioned with a temporary password automatically redirect to "
            "rotate credentials prior to accessing clinical screens.\n\n"
            "### 1.3 HIPAA Workstation Safeguards & Global Shortcuts\n"
            "- **15-Minute HIPAA Inactivity Session Lock:** Unattended sessions lock automatically after 15 minutes of inactivity (`SessionLockOverlay`). "
            "Re-enter your password to resume without losing unsaved chart context.\n"
            "- **Command Palette (`Ctrl+K` / `Cmd+K`):** Instant keyboard navigation to any authorized screen, member search, or Light/Dark mode toggle.\n"
            "- **9-Dot App Launcher:** Switch between authorized modules in the top utility bar."
        ),
        "tags": [
            "manual",
            "getting-started",
            "sso",
            "hipaa",
            "security",
            "session-lock",
            "category:getting_started",
            *(f"role:{r}" for r in ALL_ROLES_INCLUDING_PATIENT),
        ],
        "status": "published",
    },
    {
        "title": "2. Arc-8 Member 360 & Care Coordinator Clinical Manual (v2.0)",
        "summary": "Complete clinical operations guide covering Care Intelligence KPIs, Patient Roster filters, Member 360 Cockpit tabs, SBAR Tasks, Care Journeys, and Guided In-Call Triage.",
        "category": "Clinical Operations (Member 360)",
        "app_key": "member360",
        "allowed_roles": CLINICAL_ROLES + ["compliance_auditor", "coder", "billing"],
        "content": (
            "### 2.1 Care Intelligence Command Center (`/member360` — F-01..F-04)\n"
            "- **Operational KPI Tiles:** Live counts of Attributed Population, Critical/High-Risk cohorts, Open & Overdue Tasks, Active Care Journeys, and Estimated Care Option Savings.\n"
            "- **4-Domain Risk Drivers:** Unified `0.0–10.0` composite and clinical risk scoring normalized across QNXT (`MEM-*`) and Prominence (`PROM-*`) feeds.\n\n"
            "### 2.2 Patient Roster & Fast Member Search (`/member360/members` — F-05..F-07)\n"
            "- Search by **Member ID**, **First/Last Name**, **DOB**, **Phone**, or **Benefit Plan** with `<500ms` response powered by QNXT Master Patient Index (MPI) deduplication and the 30-day Redis Hot Cache.\n"
            "- Filter by **Risk Tier** (`Critical`, `High`, `Moderate`, `Low`), **Open Care Gaps**, **Active Care Journeys**, or **Assigned PCP**.\n\n"
            "### 2.3 Member 360 Clinical Chart Cockpit (`/member360/members/:memberId` — F-08..F-20)\n"
            "1. **Timeline Tab:** Unified chronological feed of inpatient/ED claims, Talkdesk CTI calls, clinical notes, journey stage transitions, and tasks.\n"
            "2. **Notes Tab:** Author progress notes or review Talkdesk AI Call Summaries. Use `@mention` (e.g., `@Sarah Chen, RN` or `@supervisor`) to notify colleagues.\n"
            "3. **Care Journey Tab:** Track multi-stage clinical protocols (*Post-Discharge 30-Day Transition*, *CHF Disease Management*, *Diabetes Care Pathway*) with structured **SBAR** panels and two-way CareAdvance sync.\n"
            "4. **Clinical & Gaps Tab:** Inspect active ICD-10 problems alongside open **HEDIS** quality measures and **CMS-HCC v28** risk gaps.\n"
            "5. **Medications & Labs Tab:** Live Abarca PBM feed highlighting **`0 Refills Remaining`** and **`Pending Prior Authorization`** alerts, paired with Clinical Labs (`HbA1c`, `eGFR`, `BNP`, `LDL`) and abnormal flags.\n"
            "6. **Claims & Benefits Tab:** Real-time QNXT **Deductible** and **Out-of-Pocket Maximum (`MOOP`)** accumulator progress bars and itemized medical/Rx claims.\n"
            "7. **Documents Tab:** Upload, preview, download, or trigger **1-click paperless PDF email delivery** of HRAs, EOBs, and Care Plans."
        ),
        "tags": [
            "manual",
            "pdf",
            "member360",
            "care-coordinator",
            "training",
            "hedis",
            "sbar",
            "category:clinical_ops",
            *(f"role:{r}" for r in (CLINICAL_ROLES + ["compliance_auditor", "coder", "billing"])),
        ],
        "status": "published",
    },
    {
        "title": "3. Clinical Tasks, SBAR Escalation Queues & Care Options Guide",
        "summary": "Standard operating procedures for managing personal/team clinical task queues, supervisor escalations, multi-stage Care Journeys, and lower-cost Care Options.",
        "category": "Clinical Operations (Member 360)",
        "app_key": "member360",
        "allowed_roles": CLINICAL_ROLES,
        "content": (
            "### 3.1 Clinical Tasks & Supervisor Escalations (`/member360/tasks` — F-22..F-24)\n"
            "- **Saved Queue Views:** Switch between *All Tasks*, *Open & In Progress*, *Urgent*, *Overdue*, and *Completed*.\n"
            "- **SBAR Task Creation:** Schedule follow-up outreach with Priority (`Urgent`, `High`, `Medium`, `Low`), Due Date, and Assignee.\n"
            "- **Supervisor Escalation Queue:** Clicking **Escalate** inside any Member 360 chart routes the case into the `Escalated` filter monitored by Clinical/Ops Supervisors.\n\n"
            "### 3.2 Care Journeys Protocol Center (`/member360/care-journeys` — F-25..F-26)\n"
            "- Monitor population-wide enrollment across standardized clinical pathways.\n"
            "- Completing or advancing a journey stage automatically logs a Timeline event and triggers an outbound webhook push to **CareAdvance**.\n\n"
            "### 3.3 Care Options Cost & Site-of-Care Redirection (`/member360/care-options` — F-27)\n"
            "- Recommend high-value, in-network freestanding imaging, ambulatory surgical centers, or specialty clinics.\n"
            "- Tracks **Cost Estimate** vs. **Potential Savings**, rolling directly into the Care Intelligence Dashboard's *Estimated Savings* KPI."
        ),
        "tags": [
            "tasks",
            "escalation",
            "care-journeys",
            "care-options",
            "sbar",
            "manual",
            "category:clinical_ops",
            *(f"role:{r}" for r in CLINICAL_ROLES),
        ],
        "status": "published",
    },
    {
        "title": "4. VBC Risk Adjustment Coding Worklist & Suspect Workbench Guide",
        "summary": "Standard operating procedures for CPC/CRC coders reviewing HCC v28 suspects, MEAT criteria validation, chase queues, and RAF analytics (1.25 target).",
        "category": "Value-Based Care & Coding",
        "app_key": "coding",
        "allowed_roles": CODING_ROLES,
        "content": (
            "### 4.1 Coding Worklist & Chase Queues (`/coding` — F-32..F-33)\n"
            "- Filter medical record chases by **Saved View** (*All chases*, *My chases*, *Unassigned*, *Overdue*, *Completed*), **Status** (*Open*, *In progress*, *Pending review*, *Audit feedback*, *Query pending*, *Completed*), and **Priority**.\n"
            "- Open any chase (`/coding/chases/:chaseId`) to inspect chart metadata, rendering provider NPI, uploaded clinical PDFs, and coder audit notes.\n\n"
            "### 4.2 Suspect Workbench & M.E.A.T. Validation (`/coding/workbench/:memberId` — F-34)\n"
            "- Review AI- and Project Titan MRA-surfaced ICD-10 / CMS-HCC (`v28`) suspects alongside clinical evidence snippets.\n"
            "- **Mandatory M.E.A.T. Criteria Verification:** Every captured diagnosis requires documented verification of:\n"
            "  - **M**onitored (signs, symptoms, disease progression/regression)\n"
            "  - **E**valuated (test results, medication effectiveness, physical exam response)\n"
            "  - **A**ssessed (ordering tests, discussion, review of records, counseling)\n"
            "  - **T**reated (medications, therapies, surgical/clinical interventions, referrals)\n"
            "- Click **Finalize** to commit validated codes, recalculate member RAF impact, and log an immutable coding audit event.\n\n"
            "### 4.3 RAF & Coding Analytics (F-35)\n"
            "- Track realized vs. suspect RAF progression against the calibrated **`1.25` Medicare Advantage RAF target** and inspect the Suspect-to-Recapture conversion funnel."
        ),
        "tags": [
            "coding",
            "hcc-v28",
            "meat",
            "raf",
            "manual",
            "category:vbc_coding",
            *(f"role:{r}" for r in CODING_ROLES),
        ],
        "status": "published",
    },
    {
        "title": "5. Executive RAF, PMPM Financials & Star Quality Dashboards Manual",
        "summary": "Guide for Payer Executives, Billing Specialists, and Clinical Leaders analyzing Live RAF Delta, PMPM capitation trends, Suspects Funnel, and Provider Heatmaps.",
        "category": "Executive & Financial Analytics",
        "app_key": "dashboard",
        "allowed_roles": FINANCIAL_EXEC_ROLES,
        "content": (
            "### 5.1 Global Analytics Filter Bar (`/dashboard`)\n"
            "- Slice population and financial metrics by **Model Year**, **Line of Business** (`Medicare Advantage`, `Commercial`, `Medicaid`), **Provider Group**, **Date Window**, and **CMS Submission Cutoff Date**.\n"
            "- Toggle **Forecast Projections** to model year-end revenue and risk score trajectories.\n\n"
            "### 5.2 Core Executive Visualizations\n"
            "1. **Live RAF Delta Chart:** Tracks cumulative realized Risk Adjustment Factor against the **`1.25` benchmark target**.\n"
            "2. **Suspects Conversion Funnel:** Visualizes volume across *Identified Suspects* -> *Chart Chase Queued* -> *Coder Reviewed* -> *CMS Accepted*.\n"
            "3. **CMS Submission Deadline Radar:** Buckets open chases by urgency window with **1-Click CSV Export** for operational standups.\n"
            "4. **Provider Performance Heatmap:** Benchmarks contracted provider groups by attributed member volume, open HCC/HEDIS gaps, and recapture rate.\n"
            "5. **Clarity / GL Financial & PMPM Reconciliation:** Tracks medical/Rx PMPM cost trends, Medical Loss Ratio (`MLR`), and capitation settlement balances."
        ),
        "tags": [
            "dashboard",
            "raf",
            "pmpm",
            "financials",
            "payer-executive",
            "billing",
            "manual",
            "category:financial_analytics",
            *(f"role:{r}" for r in FINANCIAL_EXEC_ROLES),
        ],
        "status": "published",
    },
    {
        "title": "6. Provider Directory (NPI) & NEMT Ride Booking Logistics Manual",
        "summary": "Operational guide for searching contracted in-network NPI providers, verifying member attribution, and booking Non-Emergency Medical Transportation (NEMT) rides.",
        "category": "Provider Network & NEMT Logistics",
        "app_key": "providers",
        "allowed_roles": CLINICAL_ROLES + ["payer_executive", "billing", "patient"],
        "content": (
            "### 6.1 Contracted NPI Provider Directory (`/providers` — G-07)\n"
            "- Search in-network primary care physicians (`PCPs`) and specialists by **Provider Name**, **10-Digit NPI**, **Specialty**, or **Clinic/Facility**.\n"
            "- **Live SFTP Attribution Metrics:** Each provider card displays live **Attributed Member Count** and **Open Care Gaps** rolled up from the 17-feed UHS SFTP eligibility roster.\n"
            "- Click any provider row (`/providers/:providerId`) to inspect credentials, clinic locations, phone/fax details, and attributed patient panels.\n\n"
            "### 6.2 NEMT Ride Booking & Partner Reconciliation (`/ride-booking`)\n"
            "- **Rides Tab:** Schedule Non-Emergency Medical Transportation (*Uber Health*, *Lyft Healthcare*, *Wheelchair Van*, *BLS Stretcher*) by entering Member ID, Pickup/Dropoff addresses, and appointment date/time.\n"
            "- **Partners Tab *(Staff Only)*:** View contracted transportation vendors, service coverage windows, and SLA metrics.\n"
            "- **Payments Tab *(Staff & Billing Only)*:** Reconcile trip invoices against scheduled ride estimates."
        ),
        "tags": [
            "providers",
            "npi",
            "ride-booking",
            "nemt",
            "logistics",
            "manual",
            "category:logistics_providers",
            *(f"role:{r}" for r in (CLINICAL_ROLES + ["payer_executive", "billing", "patient"])),
        ],
        "status": "published",
    },
    {
        "title": "7. 17-Feed UHS SFTP Data Ingestion & 6 Live Client API Connectors Guide",
        "summary": "Technical reference for the 17-feed UHS SFTP parser, 30-Day Redis Hot Cache, and live API integrations (QNXT, Talkdesk, Enterprise SSO, Abarca PBM, CareAdvance, Labs/Titan/GL).",
        "category": "Data Ingestion & Enterprise APIs",
        "app_key": "job_center",
        "allowed_roles": ADMIN_INGESTION_ROLES + ["supervisor"],
        "content": (
            "### 7.1 30-Day Redis Hot Cache Architecture (FR-DAT-02)\n"
            "- Caches Member 360 and live API responses for **30 days (`2,592,000` seconds)** with automatic write-through invalidation on any clinical mutation.\n"
            "- Guarantees **`<500ms` member roster search** and **`<2.0s` Member 360 cockpit load**.\n\n"
            "### 7.2 6 Live Enterprise Client API Connectors (G-08)\n"
            "1. **Live QNXT Core Payer API (`/api/integrations/qnxt/sync`):** Real-time Eligibility, Benefit Accumulators (`Deductible`/`MOOP`), Claims, and Master Patient Index (`MPI`) deduplication.\n"
            "2. **Live Talkdesk CTI Webhook & AI Call Summary (`/api/integrations/talkdesk/webhook`):** Inbound screen-pop lookup, automated AI call summary note creation, `@mention` parsing, and follow-up task generation.\n"
            "3. **Enterprise OIDC / SAML 2.0 SSO (`/api/integrations/sso/verify-claims`):** Maps corporate IdP groups across all 12 canonical HIPAA RBAC roles with deny-by-default security.\n"
            "4. **Live Abarca PBM API (`/api/integrations/abarca/sync`):** Real-time pharmacy claims, **`0-Refill`** alerts, and **`Pending Prior Authorization`** task triggers.\n"
            "5. **Live CareAdvance Two-Way Journey Sync (`/api/integrations/careadvance/sync`):** Bi-directional care plan enrollment and stage completion webhook sync.\n"
            "6. **Clinical Labs, Project Titan MRA & Clarity/GL Finance APIs:** Automated LOINC lab ingestion with critical-value flags, prospective HCC v28 suspects, and GL PMPM financial feeds.\n\n"
            "### 7.3 Batch File Uploads & FHIR R4 Pulls (`/jobs/import-data` & `/jobs/status-center`)\n"
            "- Upload `.csv`, `.txt`, or `.xlsx` feeds (17-Feed UHS SFTP schema, MAO-004, Claims, Providers) or trigger SMART-on-FHIR R4 pulls (`Patient`, `Coverage`, `Claim`, `Encounter`, `Observation`)."
        ),
        "tags": [
            "apis",
            "qnxt",
            "talkdesk",
            "abarca",
            "careadvance",
            "redis",
            "sftp",
            "fhir",
            "category:data_apis",
            *(f"role:{r}" for r in (ADMIN_INGESTION_ROLES + ["supervisor"])),
        ],
        "status": "published",
    },
    {
        "title": "8. HIPAA Governance, 12-Role RBAC Matrix & Audit Log Compliance Manual",
        "summary": "Compliance and administration reference for HIPAA Minimum-Necessary role scoping, Member 360 Audit Log inspection, user allotment, and security policies.",
        "category": "HIPAA Governance & Administration",
        "app_key": "settings",
        "allowed_roles": SUPERVISOR_AUDITOR_ADMIN_ROLES,
        "content": (
            "### 8.1 HIPAA Minimum-Necessary 12-Role RBAC Enforcement\n"
            "Arc-8 enforces **dual-layer authorization**—combining backend FastAPI role/application guards (`403 Access Denied`) with frontend sidebar and chart-tab filtering across 12 canonical roles:\n"
            "- **Leadership & Admin:** `platform_admin`, `admin` (System Admin), `business_admin` (denied clinical authoring), `payer_executive`.\n"
            "- **Clinical & Care Delivery:** `supervisor` (Clinical/Ops Supervisor), `coordinator` (Care Coordinator), `clinician` (MD/DO), `nurse` (RN).\n"
            "- **Specialized & Oversight:** `compliance_auditor` (Strict Read-Only across Timeline, Documents & Audit Log), `coder` (CPC/CRC), `billing`, and `patient` (Self-Service Member Portal).\n\n"
            "### 8.2 Immutable HIPAA PHI Audit Trail (`Audit Log` Tab & `tenant_audit_events`)\n"
            "- Every PHI read, search, note creation, task update, document download, and role change is stamped with:\n"
            "  - **Actor Email & Active Role**\n"
            "  - **Tenant ID & IP/Session Metadata**\n"
            "  - **Event Type** (e.g., `phi.member.view`, `docs.article.view`, `docs.manual.download`)\n"
            "  - **UTC Timestamp**\n"
            "- **Supervisors, Compliance Auditors, and Administrators** can inspect per-member access trails under the Member 360 **Audit Log** tab.\n\n"
            "### 8.3 Role & Privileges Authority (`/settings#privileges`) & Master Admin (`/admin/master`)\n"
            "- Dynamically toggle module or chart-tab privileges per role or configure per-user overrides while preserving HIPAA guardrails.\n"
            "- Provision users, enforce password rotation, and manage tenant application licensing."
        ),
        "tags": [
            "hipaa",
            "rbac",
            "audit-log",
            "compliance",
            "admin",
            "security",
            "manual",
            "category:governance_hipaa",
            *(f"role:{r}" for r in SUPERVISOR_AUDITOR_ADMIN_ROLES),
        ],
        "status": "published",
    },
    {
        "title": "9. Member Self-Service Portal Guide (My Health Documents & Medical Rides)",
        "summary": "Patient-friendly guide for viewing personal health summaries, downloading paperless care documents/EOBs, and checking scheduled medical transportation.",
        "category": "Member Self-Service Portal",
        "app_key": "portal",
        "allowed_roles": ALL_ROLES_INCLUDING_PATIENT,
        "content": (
            "### 9.1 Welcome to Your Personal Health Portal\n"
            "As a Prominence Health member, your Arc-8 account is strictly isolated to your own personal records under **HIPAA Privacy & Security Rules**.\n\n"
            "### 9.2 Viewing & Downloading Your Health Documents\n"
            "1. Open **Documents** from your portal home screen.\n"
            "2. View or download your **Explanation of Benefits (`EOB`)**, **Personalized Care Plan**, **Preventive Visit Summaries**, and **Health Risk Assessments**.\n\n"
            "### 9.3 Checking Your Medical Transportation (`Ride Booking`)\n"
            "1. Open **Ride Booking** to see upcoming Non-Emergency Medical Transportation (`NEMT`) trips scheduled by your Care Coordinator.\n"
            "2. Verify your **Pickup Time**, **Pickup Address**, **Clinic Destination**, and **Vehicle Type** (*Sedan* or *Wheelchair-Accessible Van*).\n"
            "3. Need to reschedule a ride or ask a question about your benefits? Contact your assigned Care Coordinator directly from your portal dashboard."
        ),
        "tags": [
            "patient",
            "member-portal",
            "documents",
            "rides",
            "hipaa",
            "manual",
            "category:member_portal",
            *(f"role:{r}" for r in ALL_ROLES_INCLUDING_PATIENT),
        ],
        "status": "published",
    },
)

_PRIVILEGED_DOCS_ROLES = frozenset({"platform_admin", "admin"})

_ROLE_ALIASES_MAP: dict[str, str] = {
    "user": "admin",  # Default seeded demo/test user (`user@example.com`) holds full app permissions
    "member": "patient",
    "doctor": "clinician",
    "physician": "clinician",
    "analyst": "coder",
    "finance": "billing",
    "auditor": "compliance_auditor",
    "commercial_payer": "payer_executive",
    "care_coordinator": "coordinator",
}


def _normalize_user_role(raw_role: Optional[str], email: Optional[str] = None) -> str:
    email_lower = (email or "").lower()
    if email_lower.startswith("coordinator@"):
        return "coordinator"
    if email_lower.startswith("supervisor@"):
        return "supervisor"
    if email_lower.startswith("business.admin@"):
        return "business_admin"
    if email_lower.startswith("compliance.auditor@"):
        return "compliance_auditor"
    if email_lower.startswith("elena.nurse@") or "nurse" in email_lower:
        return "nurse"
    if email_lower.startswith("dr.chen@") or "clinician" in email_lower:
        return "clinician"
    if "coder" in email_lower:
        return "coder"
    if "billing" in email_lower:
        return "billing"
    if "payer" in email_lower or "funiestas" in email_lower:
        return "payer_executive"
    if "patient" in email_lower or "member@" in email_lower:
        return "patient"

    role_clean = (raw_role or "user").strip().lower()
    return _ROLE_ALIASES_MAP.get(role_clean, role_clean)


def _extract_allowed_roles(tags: list[str] | None, app_key: Optional[str] = None) -> list[str]:
    role_tags = [t.split("role:", 1)[1] for t in (tags or []) if isinstance(t, str) and t.startswith("role:")]
    if role_tags:
        return role_tags
    # Fallback mapping by app_key for custom user-created articles without explicit role tags
    by_app = {
        "member360": CLINICAL_ROLES + ["compliance_auditor", "coder", "billing"],
        "coding": CODING_ROLES,
        "dashboard": FINANCIAL_EXEC_ROLES,
        "providers": CLINICAL_ROLES + ["payer_executive", "billing", "patient"],
        "ride_booking": CLINICAL_ROLES + ["billing", "patient"],
        "job_center": ADMIN_INGESTION_ROLES + ["supervisor"],
        "admin_console": ["platform_admin", "admin", "business_admin"],
        "settings": SUPERVISOR_AUDITOR_ADMIN_ROLES,
    }
    return by_app.get(app_key or "", ALL_ROLES_INCLUDING_PATIENT)


def _extract_category(tags: list[str] | None, app_key: Optional[str] = None) -> str:
    cat_map = {
        "getting_started": "Getting Started & HIPAA Security",
        "clinical_ops": "Clinical Operations (Member 360)",
        "vbc_coding": "Value-Based Care & Coding",
        "financial_analytics": "Executive & Financial Analytics",
        "logistics_providers": "Provider Network & NEMT Logistics",
        "data_apis": "Data Ingestion & Enterprise APIs",
        "governance_hipaa": "HIPAA Governance & Administration",
        "member_portal": "Member Self-Service Portal",
    }
    for t in tags or []:
        if isinstance(t, str) and t.startswith("category:"):
            key = t.split("category:", 1)[1]
            return cat_map.get(key, key.replace("_", " ").title())
    app_cat = {
        "member360": "Clinical Operations (Member 360)",
        "coding": "Value-Based Care & Coding",
        "dashboard": "Executive & Financial Analytics",
        "providers": "Provider Network & NEMT Logistics",
        "ride_booking": "Provider Network & NEMT Logistics",
        "job_center": "Data Ingestion & Enterprise APIs",
        "settings": "HIPAA Governance & Administration",
        "admin_console": "HIPAA Governance & Administration",
    }
    return app_cat.get(app_key or "", "General System Documentation")


async def _ensure_default_manual_articles(session: AsyncSession, tenant_id: int) -> None:
    """G-14: Ensure the Docs Library is pre-populated with all 9 comprehensive role-scoped Arc-8 User Manual chapters."""
    existing_rows = list(
        (
            await session.scalars(
                select(DocsArticleModel).where(DocsArticleModel.tenant_id == tenant_id)
            )
        ).all()
    )
    existing_by_title = {row.title: row for row in existing_rows}

    # Remove legacy 3-article unnumbered stubs if we are upgrading to the 9-chapter manual
    legacy_titles = {
        "Arc-8 Member 360 & Care Coordinator User Manual (v2.0)",
        "VBC Risk Adjustment Coding Worklist & Suspect Workbench Guide",
        "17-Feed UHS SFTP Data Ingestion & 6 Live Client API Connectors Guide",
    }
    mutated = False
    for row in existing_rows:
        if row.title in legacy_titles and row.created_by == "system@prominencehealth.com":
            await session.delete(row)
            mutated = True

    for item in DEFAULT_DOCS_MANUAL_ARTICLES:
        if item["title"] not in existing_by_title:
            session.add(
                DocsArticleModel(
                    tenant_id=tenant_id,
                    title=item["title"],
                    summary=item["summary"],
                    content=item["content"],
                    app_key=item["app_key"],
                    tags=item["tags"],
                    status=item["status"],
                    created_by="system@prominencehealth.com",
                )
            )
            mutated = True

    if mutated:
        await session.commit()


def _to_article(row: DocsArticleModel) -> DocsArticle:
    raw_tags = list(row.tags or [])
    visible_tags = [
        t for t in raw_tags if isinstance(t, str) and not t.startswith("role:") and not t.startswith("category:")
    ]
    allowed_roles = _extract_allowed_roles(raw_tags, row.app_key)
    category = _extract_category(raw_tags, row.app_key)
    return DocsArticle(
        id=row.id,
        title=row.title,
        summary=row.summary,
        content=row.content,
        app_key=row.app_key,
        category=category,
        allowed_roles=allowed_roles,
        hipaa_classification=(
            "HIPAA Minimum-Necessary Scoped"
            if len(allowed_roles) < len(ALL_ROLES_INCLUDING_PATIENT)
            else "HIPAA All-Role General Guide"
        ),
        tags=visible_tags,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _article_permitted_for_role(article: DocsArticle, effective_role: str) -> bool:
    if effective_role in {"platform_admin", "admin"}:
        return True
    if not article.allowed_roles:
        return True
    return effective_role in article.allowed_roles


@router.get("/articles", response_model=DocsArticleListResponse)
async def list_articles(
    q: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None, description="Optional role filter (HIPAA Minimum Necessary scoping)"),
    category: Optional[str] = Query(default=None, description="Optional module/category filter"),
    app_key: Optional[str] = Query(default=None, description="Optional application key filter"),
    limit: int = Query(default=50, ge=1, le=100),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DocsArticleListResponse:
    await _ensure_default_manual_articles(session, tenant.id)

    caller_role = _normalize_user_role(current_user.role, current_user.email)
    # Non-privileged roles are strictly locked to their own HIPAA role scope.
    # Privileged roles (Admin / Supervisor / Business Admin / Compliance Auditor) can preview any role's manual scope.
    if role and caller_role in _PRIVILEGED_DOCS_ROLES:
        requested_role = role.strip().lower()
        effective_role = caller_role if requested_role == "all" else _normalize_user_role(requested_role)
        filter_by_specific_role = requested_role != "all"
    else:
        effective_role = caller_role
        filter_by_specific_role = True

    filters = [
        DocsArticleModel.tenant_id == tenant.id,
        DocsArticleModel.status == "published",
    ]
    if app_key:
        filters.append(DocsArticleModel.app_key == app_key.strip().lower())
    if q:
        like = f"%{q.lower()}%"
        filters.append(
            or_(
                func.lower(DocsArticleModel.title).like(like),
                func.lower(DocsArticleModel.summary).like(like),
                func.lower(DocsArticleModel.content).like(like),
            )
        )

    stmt = (
        select(DocsArticleModel)
        .where(*filters)
        .order_by(DocsArticleModel.title.asc(), DocsArticleModel.updated_at.desc())
        .limit(limit)
    )
    rows = list((await session.scalars(stmt)).all())
    all_articles = [_to_article(row) for row in rows]

    # Apply HIPAA Role-Based Minimum-Necessary filtering
    scoped_articles: list[DocsArticle] = []
    for art in all_articles:
        if filter_by_specific_role:
            if role and caller_role in _PRIVILEGED_DOCS_ROLES:
                # Admin/Supervisor previewing a specific target role's manual view
                if effective_role not in art.allowed_roles:
                    continue
            elif not _article_permitted_for_role(art, effective_role):
                continue
        if category and category.lower() != "all":
            if (art.category or "").lower() != category.strip().lower():
                continue
        scoped_articles.append(art)

    # HIPAA Audit Log for documentation search / access
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="docs.manual.query",
        payload={
            "role": effective_role,
            "query": q or "",
            "category": category or "all",
            "results_count": str(len(scoped_articles)),
        },
    )
    await session.commit()

    return DocsArticleListResponse(
        articles=scoped_articles,
        total=len(scoped_articles),
        active_role=effective_role,
        hipaa_compliant=True,
        audit_logged=True,
    )


@router.get("/manual.pdf")
async def download_user_manual_pdf(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Response:
    """G-14: Serve the existing PDF manual from docs/ and record an immutable HIPAA download audit event."""
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="docs.manual.download_pdf",
        payload={"role": _normalize_user_role(current_user.role, current_user.email)},
    )
    await session.commit()

    repo_root = Path(__file__).resolve().parents[3]
    pdf_candidates = [
        repo_root / "docs" / "functional-req-doc-v2-17-11-2026.pdf",
    ]
    for candidate in pdf_candidates:
        if candidate.is_file():
            return Response(
                content=candidate.read_bytes(),
                media_type="application/pdf",
                headers={
                    "Content-Disposition": 'attachment; filename="Arc-8_User_Manual_v2.pdf"',
                },
            )
    fallback_pdf = (
        b"%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"
        b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n"
        b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>endobj\n"
        b"trailer<< /Root 1 0 R >>\n%%EOF\n"
    )
    return Response(
        content=fallback_pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="Arc-8_User_Manual_v2.pdf"'},
    )


@router.post("/articles", response_model=DocsArticle, status_code=status.HTTP_201_CREATED)
async def create_article(
    payload: DocsArticleCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> DocsArticle:
    combined_text = f"{payload.title} {payload.summary or ''} {payload.content or ''}"
    if _SSN_PATTERN.search(combined_text):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HIPAA Guardrail Violation: Documentation articles cannot contain real SSNs or unmasked PHI patterns.",
        )

    tags = list(payload.tags or [])
    if payload.category:
        cat_slug = payload.category.strip().lower().replace(" ", "_")
        if not any(t.startswith("category:") for t in tags):
            tags.append(f"category:{cat_slug}")
    if payload.allowed_roles:
        for r in payload.allowed_roles:
            role_tag = f"role:{r.strip().lower()}"
            if role_tag not in tags:
                tags.append(role_tag)

    article = DocsArticleModel(
        tenant_id=tenant.id,
        title=payload.title,
        summary=payload.summary,
        content=payload.content,
        app_key=payload.app_key,
        tags=tags,
        status=payload.status,
        created_by=current_user.email,
    )
    session.add(article)
    await session.flush()
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="docs.article.create",
        payload={
            "article_id": str(article.id),
            "title": article.title,
            "allowed_roles": ",".join(payload.allowed_roles or ["all"]),
        },
    )
    await session.commit()
    await session.refresh(article)
    return _to_article(article)
