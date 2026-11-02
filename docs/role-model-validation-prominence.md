# Role Model Validation with Prominence

**Goal:** Confirm with Prominence that Arc-8's role model correctly separates clinical and non-clinical staff, covers Member Services, and protects sensitive records.

## 1. Current state (from code)
- `users.role` is a free string defaulting to `user` ([tables.py](../backend/app/models/tables.py#L78)); in practice only `user` and `admin`.
- Access is controlled by `users.app_permissions` (JSON map of app -> level, e.g. `portal`, `admin_console`) ([migration](../backend/alembic/versions/20251004_000003_normalize_app_permissions.py)).
- **Gaps:** no clinical/non-clinical distinction, no Member Services role, no sensitive-record (PHI) tagging or access control, no break-glass or audit requirement.

## 2. Proposed role model (to validate)
| Role | Group | Access summary |
|---|---|---|
| Admin | Platform | Manage users, roles and config. No PHI by default. |
| Clinician (physician, nurse, care manager) | Clinical | Full clinical records for assigned members. |
| Clinical Support (pharmacy, lab, UM reviewer) | Clinical | Clinical data needed for their function. |
| Member Services | Non-clinical | Demographics, eligibility, benefits, claims status, call notes. No clinical notes, diagnoses or sensitive records. |
| Finance / Claims Ops | Non-clinical | Claims and billing data. Minimum-necessary clinical codes only. |
| Analyst / Reporting | Non-clinical | De-identified or aggregate data only. |
| Auditor (read-only) | Compliance | Access logs and role configuration. |

## 3. Sensitive records
Propose a `sensitivity` tag on records: `standard`, `clinical`, `restricted`.
- `restricted` covers behavioral health, substance use (42 CFR Part 2), HIV/STI, reproductive health, minors and employee-members, and VIP members.
- Restricted data requires an explicit grant plus a purpose-of-use reason. Every access is logged.
- Member Services never sees `clinical` or `restricted` content. They see only a "restricted - contact clinical team" flag.

## 4. Questions for Prominence
1. Is the clinical vs. non-clinical split above correct? Which roles are missing?
2. Can Member Services see any diagnosis, medication or authorization status? For example, do they see "prior auth pending" without the reason?
3. Which record categories does Prominence treat as sensitive or restricted?
4. Is access assignment-based (care team) or organization-wide?
5. Is break-glass access required? Who approves it, and how long does it last?
6. What are the audit and retention requirements (HIPAA minimum-necessary, access reports)?
7. Does a user hold one role or several? Can roles be time-bound?

## 5. Validation checklist
- [ ] Walkthrough meeting held with Prominence; role matrix reviewed.
- [ ] Permission matrix (role x data category x action) signed off.
- [ ] Member Services scope confirmed in writing.
- [ ] Sensitive-record categories and handling confirmed.
- [ ] Gaps and change requests logged.
- [ ] Follow-up implementation tickets created (role enum, `sensitivity` tag, access checks, audit log).

## 6. Deliverable
A signed-off role/permission matrix, plus a list of decisions and open items from Prominence.
