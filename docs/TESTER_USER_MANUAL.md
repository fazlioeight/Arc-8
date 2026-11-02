# Arc-8 (Member 360) – Tester User Manual
**Environments:** Development (`:7777`) and Testing (`:7778`) on the AWS-hosted server | **Audience:** QA testers | **Version:** 1.1

> Credentials are sent separately (never paste them into tickets or chat channels). Values in `<angle brackets>` are filled in by the Project Lead/DevOps.

---
## 1. Purpose
Arc-8 is a "single pane of glass" for Prominence Health Care Advocates, Care Coordinators and Supervisors. This manual explains how to reach the server on AWS, open the correct environment, log in, what has been built so far, and how to test and report issues.

## 2. Environments
| Environment | URL | Who uses it |
|---|---|---|
| **Arc8 Dev (AWS CloudFront)** | https://dmp0wwecjzzmr.cloudfront.net/login | Main hosted environment, reachable from any browser |
| Server - Development | `http://localhost:7777` | Developers (on the server) |
| Server - Testing | `http://localhost:7778` | Testers (on the server, via SSH tunnel) |

Always check the URL/port before testing and quote it in every bug report. Confirm with the Project Lead which environment is the official one for the current cycle.

## 3. Step 1 - Access the Server (SSH)
You need the key file `arc8-key.pem` (shared separately) and, if required, VPN/IP allow-listing.

1. Put `arc8-key.pem` in a folder and open PowerShell there.
2. Connect:
   ```
   ssh -i .\arc8-key.pem ubuntu@16.59.20.139
   ```
3. To use the server's `localhost` environments in your own browser, open a tunnel instead and keep it running:
   ```
   ssh -i .\arc8-key.pem -L 7778:localhost:7778 -L 7777:localhost:7777 -L 8989:localhost:8989 ubuntu@16.59.20.139
   ```
   Then browse to `http://localhost:7778`.
4. Key "too open" error on Windows: `icacls .\arc8-key.pem /inheritance:r /grant:r "$($env:USERNAME):R"`

Testers do not need to change anything on the server. Do not restart services or edit files.

| Symptom | Action |
|---|---|
| Cannot connect | Check VPN/IP allow-list and the key path, then contact DevOps |
| `localhost:7778` does not load | Check the tunnel is running; else report to DevOps |
| Login/API errors | Check `http://localhost:8989/docs` opens; if not, report to DevOps |

## 4. Step 2 - Log in
**Hosted Dev environment:**
1. Open https://dmp0wwecjzzmr.cloudfront.net/login
2. Enter **Workspace** `nexora`, then the email and password from the credentials file.
3. If asked, change your password on first login.

**Server environments:** open `http://localhost:7778` (via tunnel) and use the email/password from the credentials file (workspace `prominencehealth`).

You land on the **Portal**; Care Coordinators land directly on **Member 360**. Log out when finished.

| Symptom | Action |
|---|---|
| Invalid credentials | Check workspace name, caps lock; ask the Project Lead |
| 401 / 403 after login | Role lacks permission; check the account used (see §5) |
| Session expired | Log in again (token expiry is by design) |

---
## 5. Test Accounts and Roles
Use the accounts issued to you. Typical roles in the test tenant:

| Role | Example account | Should be able to |
|---|---|---|
| Care Coordinator | `coordinator@prominencehealth.com` | Member 360, notes, tasks, documents |
| Nurse / Clinician | `elena.nurse@…`, `dr.chen@…` | Member 360, chat, docs, care journeys |
| Supervisor | `supervisor@prominencehealth.com` | All coordinator features + audit log, escalation queue, settings |
| Business Admin | `business.admin@prominencehealth.com` | Admin console, settings, job center |
| Compliance Auditor | `compliance.auditor@prominencehealth.com` | Read-only/audit view |
| Admin | `admin@admin.com` | Full access |

Passwords are shared separately. Test each feature with the **correct** and **incorrect** role.

## 6. What Has Been Built So Far (scope for testing)
Based on the Functional Requirements Document (`docs/FUNCTIONAL_REQUIREMENTS_DOCUMENT.md`) and Sprint 1 backlog.

| Area | Status* | What to test |
|---|---|---|
| Authentication & RBAC (FR-AUTH) | Built | Login/logout, token expiry, role-based menus, blocked routes return 401/403, coordinator lands on Member 360 |
| Multi-tenant isolation | Built | Only `prominencehealth` data visible; no cross-tenant access |
| Portal shell / module scoping | Built | Only in-scope modules shown; hidden modules blocked by direct URL |
| Member Search (FR-SRCH) | Built | Search by Member ID, name, phone, benefit plan; empty/invalid searches |
| Member 360 profile & tabs | Built | Header info, tabs load, data accuracy |
| Care Intelligence dashboard | Built | Widgets, filters, numbers vs. source data |
| Tasks / escalation | Built | Create, assign, complete, escalate (Supervisor queue) |
| Notes | Built | Add/edit/view notes with timestamps and author |
| Care Journeys | In progress | Nurse/Coordinator access only |
| Documents | Built | Upload/view/download; file type/size limits |
| Provider directory | Built | Search and view providers |
| Audit logging | Built | Actions appear in Audit Log (Supervisor/Admin) |
| Admin consoles | Built | User/role/tab-permission management |
| Deep links | Built | `?memberId=<id>` and `?search=<q>` open the right screen |
| Data ingestion | In progress | Only if instructed |

*Confirm status with the Project Lead before each test cycle.

**Out of scope (do not log as bugs):** Talkdesk voice/SMS widget (Messages tab hidden), member-facing Portal Preview, risk-stratification score, ride booking and other hidden modules.

## 7. Suggested Test Walkthrough (first session, ~1 hour)
1. **Login** with each role; verify landing page and visible menu.
2. **Negative login:** wrong password, locked/inactive user, logout then press Back.
3. **Member Search:** search by ID, name, phone, plan; open a result.
4. **Member 360:** open every visible tab; check for errors, blank data, slow loads (>3 s).
5. **Notes & Tasks:** add a note, create/assign/complete a task, escalate as coordinator, then view as supervisor.
6. **Documents:** upload a small PDF, download it, try a disallowed file type.
7. **Dashboard:** verify widgets load and filters work.
8. **RBAC:** as a Coordinator, try opening `/admin` or the audit log URL directly – expect denial.
9. **Audit:** as Supervisor, confirm your actions were logged.
10. **Deep link:** open `http://localhost:7778/?memberId=<test-member-id>`.

## 8. Test Data Rules
- Use **only** the provided synthetic/test members. Never enter real patient data (PHI/PII).
- You may create/edit test records; do not delete shared seed data.
- Data may be reset or reseeded periodically – note the time of your tests.

## 9. Reporting Bugs
Raise each bug in `<bug tracker>` with:
- **Title** (short, specific)
- **Environment:** Testing (`localhost:7778`), URL, date/time and time zone
- **Account/role used**
- **Steps to reproduce** (numbered)
- **Expected vs. actual result**
- **Severity:** Blocker / Critical / Major / Minor / Cosmetic
- **Evidence:** screenshot or screen recording; browser console errors (F12 → Console) and failed requests (F12 → Network); remove any credentials from screenshots

Blockers (login failure, site down): message the Project Lead/DevOps immediately.

## 10. Rules of Engagement
- Do not share credentials or the URL outside the team.
- Do not run load, penetration or automated scanning tests without written approval.
- Log out when finished.
- The test environment can be restarted for deployments; check the team channel for notices.

## 11. Contacts
| Role | Name | Contact |
|---|---|---|
| Project Lead | `<name>` | `<email/chat>` |
| Tech Lead | Syed | `<email/chat>` |
| DevOps (AWS access) | Shaheer | `<email/chat>` |

## 12. Glossary
**RBAC** role-based access control · **SSO** single sign-on · **Cognito** AWS identity service · **ECS Fargate** AWS container hosting for the backend API · **RDS** AWS managed database · **PHI** protected health information.



