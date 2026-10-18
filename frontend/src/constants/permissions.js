/**
 * Role-Based Access Control (RBAC) & Fine-Grained Module Authority
 * Designed for US Enterprise Healthcare, HIPAA compliance, and Value-Based Care.
 * Directly mirrors the left sidebar menu and patient chart workspace sub-menus.
 */

export const ROLES = {
  PLATFORM_ADMIN: "platform_admin",
  ADMIN: "admin",
  CLINICIAN: "clinician",
  NURSE: "nurse",
  CODER: "coder",
  BILLING: "billing",
  PATIENT: "patient",
};

export const ROLE_DEFINITIONS = [
  {
    key: ROLES.PLATFORM_ADMIN,
    name: "Platform Administrator",
    badgeTone: "purple",
    description: "Full cross-tenant administrative control, tenant provisioning, system security, and audit enforcement.",
    icon: "ShieldLock",
  },
  {
    key: ROLES.ADMIN,
    name: "Tenant Administrator / Supervisor",
    badgeTone: "indigo",
    description: "Organization administrator with user management, privilege delegation, and configuration access.",
    icon: "BuildingGear",
  },
  {
    key: ROLES.CLINICIAN,
    name: "Clinician / Physician (MD/DO)",
    badgeTone: "cyan",
    description: "Direct clinical care delivery, PHI access, care journey orders, and medical chart reviews.",
    icon: "Stethoscope",
  },
  {
    key: ROLES.NURSE,
    name: "Care Coordinator / Nurse (RN)",
    badgeTone: "teal",
    description: "Member outreach, care journey tracking, task coordination, and NEMT ride booking.",
    icon: "HeartPulse",
  },
  {
    key: ROLES.CODER,
    name: "Risk Adjustment Coder (CPC/CRC)",
    badgeTone: "amber",
    description: "HCC code validation, chase queue operations, RAF score analytics, and chart auditing.",
    icon: "ClipboardCheck",
  },
  {
    key: ROLES.BILLING,
    name: "Billing & Capitation Specialist",
    badgeTone: "emerald",
    description: "PMPM financial analytics, capitation contract modeling, claims, and settlement reporting.",
    icon: "CurrencyDollar",
  },
  {
    key: ROLES.PATIENT,
    name: "Member / Patient",
    badgeTone: "slate",
    description: "Self-service member portal, personal health tracking, upcoming rides, and care journey visibility.",
    icon: "Person",
  },
];

/**
 * Hierarchical Permission Categories mirroring the Left Navigation Menu
 * Sections (Clinical Ops, VBC Ops, Governance & Admin) -> Modules -> Sub-Menus
 */
export const PERMISSION_CATEGORIES = [
  {
    id: "clinical_operations",
    title: "Clinical Operations",
    description: "Core clinical care delivery, patient rosters, journeys, and chart workspace modules.",
    modules: [
      {
        key: "menu:care_intelligence",
        label: "Care Intelligence Dashboard",
        description: "Access high-level care intelligence KPIs, population risk trends, and priority queues.",
      },
      {
        key: "menu:patient_roster",
        label: "Patient Roster (Member 360)",
        description: "Search and open member 360 charts, rosters, and clinical workspaces.",
        subPermissions: [
          {
            key: "tab:timeline",
            label: "Timeline (Activity & Encounters)",
            description: "Chronological feed of clinical encounters, claims, notes, and journey transitions.",
            isSubMenu: true,
          },
          {
            key: "tab:notes",
            label: "Clinical Notes & Collaborative Mentions",
            description: "Author and view progress notes, encounter summaries, and cross-team @mention tagging.",
            isSubMenu: true,
          },
          {
            key: "tab:care_journey",
            label: "Care Journey Protocols",
            description: "Inspect active pathways, milestone completions, and care stages for the patient.",
            isSubMenu: true,
          },
          {
            key: "tab:clinical_gaps",
            label: "Clinical & Risk Gaps (Problems + Gaps)",
            description: "Combined view of active Problems/HCCs and open clinical care gaps for instant closure.",
            isSubMenu: true,
          },
          {
            key: "tab:medications_labs",
            label: "Medications & Labs (Rx + Diagnostics)",
            description: "Integrated view of active medications, refill tracking, lab biometrics, and imaging.",
            isSubMenu: true,
          },
          {
            key: "tab:claims_benefits",
            label: "Claims & Benefits (Claims + Accumulators)",
            description: "Combined financial view showing Deductible/OOP progress bars and itemized medical claims.",
            isSubMenu: true,
          },
          {
            key: "tab:documents",
            label: "Patient Documents & Email Delivery",
            description: "Patient file repository with 1-click paperless email dispatch.",
            isSubMenu: true,
          },
          {
            key: "tab:audit_log",
            label: "Audit Log & Security (Supervisor/Admin)",
            description: "HIPAA-mandated tamper-evident access log showing who viewed or edited this patient record.",
            isSubMenu: true,
            supervisorOnly: true,
          },
          {
            key: "tab:settings",
            label: "Member Settings & Sharing (Supervisor/Admin)",
            description: "Administrative patient consent management, family sharing, and record preferences.",
            isSubMenu: true,
            supervisorOnly: true,
          },
        ],
      },
      {
        key: "menu:tasks",
        label: "Clinical Tasks",
        description: "Coordinate, assign, and track patient follow-up and care management tasks.",
      },
      {
        key: "menu:care_journeys",
        label: "Care Journeys Protocol Center",
        description: "Initiate and track multi-stage disease management care journey protocols.",
      },
      {
        key: "menu:risk_intelligence",
        label: "Risk Intelligence & Stratification",
        description: "Analyze disease burden, prospective HCC suspects, and predictive risk bands.",
      },
      {
        key: "menu:care_options",
        label: "Care Options & Recommendations",
        description: "Create and order personalized care options and clinical interventions.",
      },
      {
        key: "menu:messages",
        label: "Clinical Messaging & Outreach",
        description: "HIPAA-compliant secure messaging with patients, caregivers, and care teams.",
      },
      {
        key: "menu:documents",
        label: "Global Documents Repository",
        description: "View and upload clinical documents, CCDs, continuity of care records, and reports.",
      },
    ],
  },
  {
    id: "vbc_operations",
    title: "Value-Based Care & Operations",
    description: "Risk adjustment coding workbenches, capitation modeling, providers, and transportation.",
    modules: [
      {
        key: "menu:coding_worklist",
        label: "Coding Worklist (v28 / CMS-HCC)",
        description: "Review and validate suspect HCC medical charts and chase queue items.",
        subPermissions: [
          {
            key: "sub:coding_worklist",
            label: "Coding Worklist Queue",
            description: "Main active chart chase and HCC coding review queue.",
            isSubMenu: true,
          },
          {
            key: "sub:coding_chases",
            label: "Coder Suspect Workbench",
            description: "Granular chart review, suspect verification, and audit sign-off.",
            isSubMenu: true,
          },
        ],
      },
      {
        key: "menu:executive_dashboards",
        label: "Executive Dashboards",
        description: "PMPM financial performance, capitation reconciliation, and shared savings reports.",
        subPermissions: [
          {
            key: "sub:exec_financial",
            label: "PMPM Financial Analytics",
            description: "Capitation settlement, MLR analysis, and shared savings trends.",
            isSubMenu: true,
          },
          {
            key: "sub:exec_hedis",
            label: "HEDIS Quality & Star Ratings",
            description: "CMS 5-Star quality measures and clinical performance benchmarks.",
            isSubMenu: true,
          },
        ],
      },
      {
        key: "menu:provider_directory",
        label: "Provider Directory",
        description: "Network physician search, specialty lookup, and credential validation.",
      },
      {
        key: "menu:ride_booking",
        label: "Ride Booking (NEMT Logistics)",
        description: "Schedule non-emergency medical transportation for member clinical appointments.",
      },
      {
        key: "menu:ai_chat",
        label: "Nexora Clinical AI Chat",
        description: "Interactive AI copilot for clinical guidelines, drug interactions, and member summaries.",
      },
    ],
  },
  {
    id: "governance_admin",
    title: "Governance & Administration",
    description: "System security, role privilege delegation, and platform configuration.",
    modules: [
      {
        key: "menu:role_privileges",
        label: "Role & Privileges Authority (HIPAA)",
        description: "Configure system-wide module and sub-menu visibility across all user roles.",
      },
      {
        key: "menu:master_admin",
        label: "Master Admin Console",
        description: "Cross-tenant organization management, tenant provisioning, and global telemetry.",
      },
      {
        key: "menu:platform_settings",
        label: "Platform Settings & Integrations",
        description: "FHIR/HL7 endpoints, organization branding, SSO, and compliance rules.",
        subPermissions: [
          {
            key: "sub:settings_general",
            label: "Tenant & Organization Profile",
            description: "Brand customization, domain settings, and plan metadata.",
            isSubMenu: true,
          },
          {
            key: "sub:settings_security",
            label: "Security & HIPAA Audit Policy",
            description: "MFA enforcement, session timeouts, and HIPAA audit trail configuration.",
            isSubMenu: true,
          },
          {
            key: "sub:settings_integrations",
            label: "EHR & FHIR API Integrations",
            description: "Epic/Cerner SMART-on-FHIR connectors and HL7 v2 interfaces.",
            isSubMenu: true,
          },
        ],
      },
    ],
  },
];

// Ensure backward compatibility: populate category.permissions as flat list
PERMISSION_CATEGORIES.forEach((cat) => {
  cat.permissions = cat.modules.flatMap((m) => [m, ...(m.subPermissions || [])]);
});

/** All permission keys array */
export const ALL_PERMISSION_KEYS = PERMISSION_CATEGORIES.flatMap((c) =>
  c.modules.flatMap((m) => [
    m.key,
    ...(m.subPermissions ? m.subPermissions.map((s) => s.key) : []),
  ])
);

/** Default permission assignments per role */
export const DEFAULT_ROLE_PERMISSIONS = {
  [ROLES.PLATFORM_ADMIN]: [...ALL_PERMISSION_KEYS],
  [ROLES.ADMIN]: [...ALL_PERMISSION_KEYS],
  [ROLES.CLINICIAN]: [
    "menu:care_intelligence",
    "menu:patient_roster",
    "tab:timeline",
    "tab:notes",
    "tab:care_journey",
    "tab:clinical_gaps",
    "tab:medications_labs",
    "tab:claims_benefits",
    "tab:documents",
    "menu:tasks",
    "menu:care_journeys",
    "menu:risk_intelligence",
    "menu:care_options",
    "menu:messages",
    "menu:documents",
    "menu:coding_worklist",
    "sub:coding_worklist",
    "sub:coding_chases",
    "menu:executive_dashboards",
    "sub:exec_financial",
    "sub:exec_hedis",
    "menu:provider_directory",
    "menu:ride_booking",
    "menu:ai_chat",
  ],
  [ROLES.NURSE]: [
    "menu:care_intelligence",
    "menu:patient_roster",
    "tab:timeline",
    "tab:notes",
    "tab:care_journey",
    "tab:clinical_gaps",
    "tab:medications_labs",
    "tab:claims_benefits",
    "tab:documents",
    "menu:tasks",
    "menu:care_journeys",
    "menu:care_options",
    "menu:messages",
    "menu:documents",
    "menu:provider_directory",
    "menu:ride_booking",
    "menu:ai_chat",
  ],
  [ROLES.CODER]: [
    "menu:patient_roster",
    "tab:timeline",
    "tab:notes",
    "tab:clinical_gaps",
    "tab:claims_benefits",
    "tab:documents",
    "menu:coding_worklist",
    "sub:coding_worklist",
    "sub:coding_chases",
    "menu:documents",
    "menu:ai_chat",
  ],
  [ROLES.BILLING]: [
    "menu:patient_roster",
    "tab:timeline",
    "tab:claims_benefits",
    "tab:documents",
    "menu:executive_dashboards",
    "sub:exec_financial",
    "menu:documents",
  ],
  [ROLES.PATIENT]: [
    "menu:documents",
    "menu:ride_booking",
    "tab:timeline",
    "tab:medications_labs",
    "tab:documents",
  ],
};

const STORAGE_KEY = "nexora_role_permissions_matrix";

export const getPersistedRolePermissions = () => {
  if (typeof window === "undefined") return DEFAULT_ROLE_PERMISSIONS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ROLE_PERMISSIONS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_ROLE_PERMISSIONS, ...parsed };
  } catch (e) {
    console.warn("Failed to load permissions matrix", e);
    return DEFAULT_ROLE_PERMISSIONS;
  }
};

export const savePersistedRolePermissions = (matrix) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matrix));
    window.dispatchEvent(new CustomEvent("permissions:updated", { detail: matrix }));
  } catch (e) {
    console.warn("Failed to save permissions matrix", e);
  }
};

/** Demo personas for instant one-click login testing */
export const DEMO_PERSONAS = [
  {
    role: ROLES.ADMIN,
    name: "Alexandra Vance",
    title: "System Administrator",
    email: "admin@admin.com",
    department: "Executive Operations",
    avatar: "AV",
  },
  {
    role: ROLES.CLINICIAN,
    name: "Dr. Sarah Chen, MD",
    title: "Lead Physician & Medical Director",
    email: "dr.chen@prominencehealth.com",
    department: "Internal Medicine",
    avatar: "SC",
  },
  {
    role: ROLES.NURSE,
    name: "Elena Rostova, RN",
    title: "Senior Care Coordinator",
    email: "elena.nurse@prominencehealth.com",
    department: "Care Management",
    avatar: "ER",
  },
  {
    role: ROLES.CODER,
    name: "Marcus Vance, CPC",
    title: "Risk Adjustment Coding Lead",
    email: "marcus.coder@prominencehealth.com",
    department: "Quality & Revenue Integrity",
    avatar: "MV",
  },
  {
    role: ROLES.BILLING,
    name: "Rachel Adams",
    title: "Capitation & Financial Analyst",
    email: "rachel.billing@prominencehealth.com",
    department: "Finance & Actuarial",
    avatar: "RA",
  },
  {
    role: ROLES.PATIENT,
    name: "James Wilson",
    title: "Member / Patient",
    email: "james.member@prominencehealth.com",
    department: "Prominence Health Plus Plan",
    avatar: "JW",
  },
];
