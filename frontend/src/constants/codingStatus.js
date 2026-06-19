// Canonical coding-chase status vocabulary — single source of truth for the
// UI. Mirrors backend/app/services/coding_status.py. Keep the two in sync.

export const CHASE_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  PENDING_REVIEW: 'pending_review',
  AUDIT_FEEDBACK: 'audit_feedback',
  QUERY_PENDING: 'query_pending',
  COMPLETED: 'completed',
};

// Ordered list with display labels, for dropdowns and filter chips.
export const CHASE_STATUS_OPTIONS = [
  { key: CHASE_STATUS.OPEN, label: 'Open' },
  { key: CHASE_STATUS.IN_PROGRESS, label: 'In progress' },
  { key: CHASE_STATUS.PENDING_REVIEW, label: 'Pending review' },
  { key: CHASE_STATUS.AUDIT_FEEDBACK, label: 'Audit feedback' },
  { key: CHASE_STATUS.QUERY_PENDING, label: 'Query pending' },
  { key: CHASE_STATUS.COMPLETED, label: 'Completed' },
];

// Work is finished.
export const TERMINAL_CHASE_STATUSES = [CHASE_STATUS.COMPLETED];
