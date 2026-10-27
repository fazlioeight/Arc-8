# Functional Requirements Document (FRD) — Arc-8 (Member 360)

| | |
|---|---|
| **Project** | Arc-8 MVP — Prominence Health First Inc. (SOW No. 3) |
| **Version / Status** | v0.1 DRAFT — for review by Project Lead, QA, Data, DevOps |
| **Sources** | Client walkthrough (Oct 15, 2026), `docs/architecture/PROPOSED_SYSTEM_WORKFLOW_FROM_CLIENT_WALKTHROUGH.md`, `docs/architecture/RTM_v0.1_and_Sprint_1_Backlog.md` |
| **Priority key** | P1 = MVP (year-end), P2 = MVP if capacity allows, P3 = deferred |

---

## 1. Introduction

### 1.1 Purpose
Defines the functional behaviour of Arc-8, a "single pane of glass" for Prominence Health Care Advocates, Care Coordinators and Supervisors. It is the basis for design, development, QA test cases and acceptance.

### 1.2 Business problem
- Call-center agents cannot see prior conversations with a member, so they spend about 15 minutes searching QNXT, which only shows batch data from the previous day.
- Inbound calls (about 60k/month for claim status) are missed chances to close care gaps, assign a PCP, or fix Rx issues.
- Nurses are the highest-cost resource. Routine post-discharge steps should be completable by Advocates.
- Pharmacy friction (0 refills, expired prior auths) hurts CMS Star Ratings and CAHPS.
- Printing costs about \$1M/year and documents sit on a legacy file share.

### 1.3 Scope
**In scope (MVP):** SSO/RBAC, member search, Member 360 profile and tabs, care intelligence dashboard, tasks/escalation, notes, care journeys, documents, provider directory, audit logging, admin consoles, data ingestion.

**Out of scope / deferred:** Talkdesk embedded voice/SMS widget (the `Messages` tab is hidden), member-facing portal (`Portal Preview` hidden), risk stratification score in the header (pending the partner integration), ride booking and other monorepo modules (hidden).

### 1.4 Users and roles
| Role | Description | Access |
|---|---|---|
| Care Advocate | Call center agent | Member 360 core tabs, notes, tasks, documents |
| Care Coordinator / Nurse | Clinical follow-up | Same as Advocate, plus Care Journeys |
| Supervisor / Ops | Team oversight | All of the above, plus Audit Log, Sharing, Settings, escalation queue |
| Tenant Admin | Prominence admin | Users, roles, tab permissions |
| Master Admin | Vendor (platform owner) | Tenant provisioning, module licensing |

### 1.5 External systems
QNXT (eligibility, claims, providers), Project Titan/MRA (HCC gaps), Abarca PBM (medications, refills, PAs), CareAdvance (care journeys), lab feeds, Talkdesk (call metadata and AI summary).

---

## 2. Functional Requirements

### 2.1 Authentication, Access and Tenancy (RTM-01) — P1
| ID | Requirement |
|---|---|
| FR-AUTH-01 | The system shall authenticate users via OIDC SSO (AWS Cognito/JWKS), with a local-dev fallback only when `ALLOW_DUMMY_LOGIN` is enabled. |
| FR-AUTH-02 | The system shall resolve tenant context from `X-Tenant-Key` and isolate tenant data. |
| FR-AUTH-03 | The system shall enforce RBAC for the Coordinator, Supervisor and Admin personas. `/api/member360/admin/*` is Admin only, and escalation queues are Supervisor/Admin only. |
| FR-AUTH-04 | Unauthenticated or cross-tenant requests shall return 401/403 and write an audit event. |
| FR-AUTH-05 | Access tokens shall expire and refresh tokens shall enforce idle and absolute lifetimes (configurable). |
| FR-AUTH-06 | The portal shall show only in-scope modules (`PORTAL_APPLICATIONS`) and block others by route guard. |
| FR-AUTH-07 | A Care Coordinator shall land directly on the Member 360 workspace after login. |
| FR-AUTH-08 | Deep links `?memberId=<id>` and `?search=<q>` shall open the member profile or search results directly (Talkdesk screen-pop). |

### 2.2 Member Search (RTM-02) — P1
| ID | Requirement |
|---|---|
| FR-SRCH-01 | Users shall be able to search by Member ID, first/last name, phone, or benefit plan. |
| FR-SRCH-02 | Results shall return in under 500 ms (target under 1 s end-to-end, with a Typesense index in the target design). |
| FR-SRCH-03 | Selecting a result shall open the member chart directly. There shall be no separate "Chart" tab and no redundant quick-search box on the Portal Overview. |

### 2.3 Member 360 Header and Alerts (RTM-03) — P1
| ID | Requirement |
|---|---|
| FR-HDR-01 | The header shall show name, Member ID, plan ID/name, age, gender, PCP link (to the Provider Directory profile) and an amber Gaps badge with count. |
| FR-HDR-02 | If PCP is blank, the header shall show a high-visibility "Missing PCP" alert and allow in-network PCP assignment. |
| FR-HDR-03 | The header shall surface alerts for open gaps, an active care journey, and Rx 0 refills or expiring PA. |
| FR-HDR-04 | The risk stratification badge shall be hidden until the external risk integration is finalised. |

### 2.4 Member 360 Tabs
| ID | Tab | Requirement | Priority |
|---|---|---|---|
| FR-TL-01 | **Timeline** | Chronological log of all touchpoints (claim ingested, call, care plan review, journey stage, note). Each row shall be clickable and drill down to its claim, note or task. | P1 |
| FR-NT-01 | **Notes** | Internal-only notes. Users can paste the Talkdesk AI call summary. Each note records author and time. | P1 |
| FR-NT-02 | **Notes** | `@mention` tagging shall notify the tagged user. | P2 |
| FR-CL-01 | **Claims & Accumulators** | Show claim status (paid/pending), billed, paid and member responsibility. | P1 |
| FR-CL-02 | **Claims & Accumulators** | Show Deductible and MOOP progress bars (medical and pharmacy combined). | P1 |
| FR-CG-01 | **Care Gaps & HCCs** | List suspected/open HCC gaps (Project Titan file). When a diagnosis appears on a claim, the ICD-10 moves to Problems/HCC and the gap closes. | P1 |
| FR-CG-02 | **Care Gaps & HCCs** | Show all diagnoses, with a `$`/star badge on CMS revenue/RAF-impact codes. | P1 |
| FR-RX-01 | **Medications** | Show active/historical Rx, last fill, refills remaining and prescriber. | P1 |
| FR-RX-02 | **Medications** | Highlight 0 refills and expiring PAs (especially critical drugs such as insulin). | P1 |
| FR-LB-01 | **Labs & Imaging** | Show results (HbA1c, BNP, creatinine, lipids) with High/Abnormal flags, so pre-visit lab completion can be verified. | P1 |
| FR-CJ-01 | **Care Journey** | Show journeys synced from CareAdvance (discharge intake, med reconciliation, cardiology follow-up, 30-day outcome) and SBAR tasks. | P1 |
| FR-CJ-02 | **Care Journey** | Users can Start and Complete stages. Each change is written to the timeline. | P1 |
| FR-DC-01 | **Documents** | Per-member upload, view and download of HRAs, care forms, invoices and lab PDFs, stored encrypted. | P1 |
| FR-DC-02 | **Documents** | A "Send Document to Member" action shall email a document to the member and log the event. | P2 |
| FR-AD-01 | **Audit Log / Sharing / Settings** | Visible to Supervisor, Ops and Admin only. | P1 |
| FR-HID-01 | Hidden tabs | `Messages`, `Portal Preview` and `Chart` shall not appear in the UI (code retained). | P1 |

### 2.5 Care Intelligence Dashboard (RTM-09) — P1/P2
| ID | Requirement |
|---|---|
| FR-DSH-01 | Show counts of members in active workflows, high-risk and critical-risk members, open/overdue tasks and active journeys. The high-risk (C-SNP) definition is to be confirmed with Prominence. |
| FR-DSH-02 | Show "My To-Dos" for the logged-in user. Clicking a task deep-links to the member chart. |

### 2.6 Tasks and Escalation (RTM-06) — P1
| ID | Requirement |
|---|---|
| FR-TSK-01 | Users can create, assign, update and close tasks linked to a member. |
| FR-TSK-02 | Coordinators shall have a worklist, and Supervisors a queue of escalated or unresolved tasks. |
| FR-TSK-03 | Configurable triggers shall auto-escalate (for example, a missed 48-hour post-discharge follow-up). |

### 2.7 Risk Insights (RTM-04) — P1 (later sprint)
| ID | Requirement |
|---|---|
| FR-RSK-01 | Provide a normalised risk score with explainable drivers and filterable rising-risk cohorts. Member header display is deferred (FR-HDR-04). |

### 2.8 Provider Directory (RTM-10) — P2
| ID | Requirement |
|---|---|
| FR-PRV-01 | Searchable in-network directory keyed by NPI. |
| FR-PRV-02 | The data model and UI shall support a many-to-many Provider↔Facility relationship. Claims shall carry the billing facility. |
| FR-PRV-03 | PCP assignment shall link a member to a provider profile. |

### 2.9 Administration — P1/P2
| ID | Requirement |
|---|---|
| FR-ADM-01 | The Master Admin console shall control which modules each tenant has purchased. |
| FR-ADM-02 | The Tenant Admin console shall manage users, roles and tab-level permissions. |
| FR-ADM-03 | The UI shall be branded "Arc-8" (all "Nexora Lab" references replaced). |

### 2.10 Audit and Compliance (RTM-08) — P1
| ID | Requirement |
|---|---|
| FR-AUD-01 | Every view, modification and export of member data shall record actor, tenant, member, action, IP and timestamp. |
| FR-AUD-02 | Audit records shall be tamper-evident (immutable at the DB level) and shipped to CloudWatch. |
| FR-AUD-03 | Notes, tasks, uploaded documents and journey updates created in Arc-8 shall be retained 10 years (monthly archival to cold storage). Source data is not archived by Arc-8. |
| FR-AUD-04 | Only synthetic data shall be used in non-production environments. |

### 2.11 Data Ingestion and Caching — P1
| ID | Requirement |
|---|---|
| FR-DAT-01 | Ingest QNXT, Titan/MRA, Abarca, CareAdvance, lab and Talkdesk data via SFTP/batch ETL into a common data model (PostgreSQL). Import jobs shall be tracked with status and errors. |
| FR-DAT-02 | Data active in the last 30 days shall be served from a hot cache. |
| FR-DAT-03 | Schema changes shall be managed through Alembic migrations. |
| FR-DAT-04 | Events shall be published reliably through the outbox pattern. |

---

## 3. Key Workflow — Inbound Call

1. The member calls via Talkdesk. The Advocate opens Arc-8 by screen-pop or search.
2. The Member 360 header loads. The Advocate checks the PCP, Gaps, Journey and Rx alerts.
3. The Advocate resolves the call driver: Claims & Accumulators, Timeline/Notes, Documents, or Labs/Problems.
4. Before the call ends, the Advocate pastes the AI summary into Notes (with `@mention` if needed) and creates a follow-up task or escalates.
5. The system appends a timeline touchpoint and writes an audit event.

## 4. Non-Functional Requirements
| ID | Requirement |
|---|---|
| NFR-01 | **Performance:** search under 500 ms, and member profile load within 2 s from hot cache. |
| NFR-02 | **Security:** HIPAA controls, TLS in transit, field-level encryption at rest, security headers, rate limiting, optional MFA for admin/PHI. |
| NFR-03 | **Availability:** health endpoints `/health/live` and `/health/ready` on AWS Dev. |
| NFR-04 | **Portability:** no runtime dependency on Azure services (use AWS Secrets Manager and S3). |
| NFR-05 | **Quality:** CI gates for lint, unit tests, SAST, Trivy and SBOM. Deploys via GitHub Actions OIDC with no static keys. |
| NFR-06 | **Usability:** the Advocate completes the core call workflow within a single screen and without re-fetching. |

## 5. Assumptions, Dependencies and Open Items
- Source-system feed formats and schedules are owned by Prominence (QNXT, Abarca, CareAdvance).
- The Talkdesk integration is deferred. Summaries are pasted manually for now.
- **Open:** the C-SNP high-risk definition, the risk partner integration timeline, the `@mention` notification channel, and the email delivery provider for FR-DC-02.

## 6. Traceability
| FRD section | RTM |
|---|---|
| 2.1 | RTM-01 |
| 2.2 | RTM-02 |
| 2.3, 2.4 | RTM-03, RTM-05, RTM-07 |
| 2.5 | RTM-09 |
| 2.6 | RTM-06 |
| 2.7 | RTM-04 |
| 2.8, 2.9 | RTM-10 |
| 2.10 | RTM-08 |

## 7. Acceptance
Each requirement is accepted when it is verified by the method in RTM v0.1 (unit, integration, E2E, perf, security audit). Zero Sev-1/Sev-2 defects are open.
