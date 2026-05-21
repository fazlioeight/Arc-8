"""Operational-data registry for the chat "dataset" SQL tool.

Lists the tenant-resident tables Claude is allowed to introspect and query.
Column types are read live from each tenant's database — this registry only
carries friendly names + a short description that ships in the system prompt
so the model can pick the right table without hallucinating column names.

These are the tenant's *operational* tables (Member360 + Coding), not
uploaded analytics extracts. There is intentionally no loader: users cannot
add rows here through the chat surface; the data is whatever the
application has written to the tenant DB by its normal mutation paths.

To add a table:
  1. Append an entry below with a friendly name + description.
  2. That's it — column types are introspected at query time.
"""
from __future__ import annotations


DATASET_TABLES: dict[str, dict] = {
    # ── Member360 (the canonical patient/member 360-degree view) ───────────
    "m360_members": {
        "friendly_name": "Members",
        "description": (
            "One row per member in the tenant's Member360 program. Columns "
            "include demographics (name, dob, sex), payer id, current risk "
            "score, attribution status, and the assigned care manager."
        ),
    },
    "m360_problems": {
        "friendly_name": "Problems / chronic conditions",
        "description": (
            "Chronic and active conditions per member, keyed by ICD-10 and "
            "HCC code. Includes onset date, status (active/resolved), and "
            "the source (claim, encounter, or chart review)."
        ),
    },
    "m360_medications": {
        "friendly_name": "Medications",
        "description": (
            "Active and historical medications per member. RX-level rows "
            "with drug name, NDC, dose, frequency, prescriber, fill date."
        ),
    },
    "m360_labs": {
        "friendly_name": "Labs",
        "description": (
            "Lab results per member: LOINC code, lab name, result value, "
            "units, reference range, abnormal flag, and observed date."
        ),
    },
    "m360_claims": {
        "friendly_name": "Member claims",
        "description": (
            "Claim-level rows attached to Member360 members. Includes "
            "service date, provider, claim type, paid amount, and the "
            "primary diagnosis/procedure codes."
        ),
    },
    "m360_care_journeys": {
        "friendly_name": "Care journeys",
        "description": (
            "Active and historical care journeys per member (e.g. CHF "
            "30-day discharge, diabetes uncontrolled). Includes the "
            "template, current stage, owner, and start/end dates."
        ),
    },
    "m360_tasks": {
        "friendly_name": "Tasks",
        "description": (
            "Open and completed work items per member: outreach calls, "
            "chart reviews, care-plan steps. Includes status, priority, "
            "assignee, due date, and the parent care journey if any."
        ),
    },
    "m360_risk_insights": {
        "friendly_name": "Risk insights",
        "description": (
            "AI-derived risk drivers and recommended actions per member. "
            "Each row carries a label, severity, and free-text rationale "
            "produced by the platform's risk-prioritisation pipeline."
        ),
    },
    "m360_accumulators": {
        "friendly_name": "Accumulators",
        "description": (
            "Per-member spend tracking against deductible, out-of-pocket "
            "max, and other plan accumulators."
        ),
    },

    # ── Coding worklist (HCC chase tracking) ───────────────────────────────
    "coding_members": {
        "friendly_name": "Coding members",
        "description": (
            "Members tracked in the coder worklists. Joined to chases and "
            "claims; includes attribution to a coder and current chase "
            "completion state."
        ),
    },
    "coding_member_chases": {
        "friendly_name": "HCC chases",
        "description": (
            "Individual HCC chases per coding member: HCC code, suspect "
            "score, status (open/in-review/closed), the originating record "
            "type (claim, encounter, HRA), and the reviewing coder."
        ),
    },
    "coding_claims": {
        "friendly_name": "Coding claims",
        "description": (
            "Claims surfaced into the coder worklist with the diagnosis "
            "codes flagged for review."
        ),
    },
    "coding_health_assessments": {
        "friendly_name": "Health assessments",
        "description": (
            "Captured HRA (health risk assessment) results per member. "
            "Useful for finding self-reported conditions that don't yet "
            "appear on a claim."
        ),
    },
}
