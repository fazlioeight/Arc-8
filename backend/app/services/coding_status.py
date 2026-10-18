"""Canonical coding-chase status vocabulary — single source of truth.

The UI workflow vocabulary is authoritative (see the matching
``frontend/src/constants/codingStatus.js``). Backend filters and the workbench
finalize step map onto these values so "open work" queries, review rollups,
and the worklist all agree on what each status means.
"""
from __future__ import annotations

OPEN = "open"
IN_PROGRESS = "in_progress"
PENDING_REVIEW = "pending_review"
AUDIT_FEEDBACK = "audit_feedback"
QUERY_PENDING = "query_pending"
COMPLETED = "completed"

# Ordered workflow vocabulary.
CHASE_STATUSES = (
    OPEN,
    IN_PROGRESS,
    PENDING_REVIEW,
    AUDIT_FEEDBACK,
    QUERY_PENDING,
    COMPLETED,
)

# Work is finished — excluded from "open work" queries and assignment rollups.
TERMINAL_CHASE_STATUSES = (COMPLETED,)

DEFAULT_CHASE_STATUS = OPEN
