/**
 * Role-Based Access Control (RBAC) & Fine-Grained Permissions
 * Designed for US Enterprise Healthcare, HIPAA compliance, and Value-Based Care.
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
    name: "Tenant Administrator",
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

export const PERMISSION_CATEGORIES = [
  {
    id: "clinical",
    title: "Clinical & PHI Governance",
    description: "HIPAA-regulated Protected Health Information (PHI) and clinical records.",
    permissions: [
      {
        key: "phi:read",
        label: "View Patient PHI & Charts",
        description: "Read member demographic, clinical history, and diagnostic charts.",
      },
      {
        key: "phi:write",
        label: "Author Clinical Notes",
        description: "Draft, sign, and append progress notes, care plans, and clinical findings.",
      },
      {
        key: "care:manage",
        label: "Manage Care Journeys",
        description: "Assign care protocols, order clinical interventions, and close care gaps.",
      },
      {
        key: "vitals:view",
        label: "Vitals & Lab Biometrics",
        description: "Access biometric telemetry, lab results, and real-time vital trends.",
      },
    ],
  },
  {
    id: "coding",
    title: "Risk Adjustment & HCC Coding",
    description: "CMS-HCC / HHS-HCC risk adjustment workflows and validation workbenches.",
    permissions: [
      {
        key: "coding:worklist",
        label: "Access Coding Worklist",
        description: "Review member cohorts prioritized by suspected HCC gaps and suspect logic.",
      },
      {
        key: "coding:chase",
        label: "Manage Record Chases",
        description: "Initiate and track electronic record retrieval and chase statuses.",
      },
      {
        key: "coding:validate",
        label: "Validate & Submit HCCs",
        description: "Accept, reject, and submit validated ICD-10/HCC codes to payers.",
      },
      {
        key: "raf:view",
        label: "Analyze RAF Scores",
        description: "Inspect predicted vs actual Risk Adjustment Factor (RAF) metrics.",
      },
    ],
  },
  {
    id: "operations",
    title: "Operations & Transportation",
    description: "Non-Emergency Medical Transportation (NEMT) and operational pipelines.",
    permissions: [
      {
        key: "rides:book",
        label: "Book Medical Rides",
        description: "Schedule NEMT rides for members to attend scheduled clinical appointments.",
      },
      {
        key: "rides:manage",
        label: "Dispatch & Ride Overrides",
        description: "Cancel, reassign drivers, and manage transportation logistics exceptions.",
      },
      {
        key: "jobs:manage",
        label: "Operations & Data Imports",
        description: "Trigger EHR integrations, HL7/FHIR batch imports, and pipeline jobs.",
      },
    ],
  },
  {
    id: "financial",
    title: "Value-Based Analytics & Finance",
    description: "Capitation modeling, PMPM financial analytics, and executive reporting.",
    permissions: [
      {
        key: "analytics:view",
        label: "Executive Dashboards",
        description: "Access executive population health dashboards and KPI metrics.",
      },
      {
        key: "capitation:view",
        label: "Capitation & Cost Analyzer",
        description: "Run risk corridor, benchmark PMPM, and shared savings simulations.",
      },
      {
        key: "reports:export",
        label: "Export Clinical & Financial Data",
        description: "Export HIPAA-compliant de-identified or authorized summary reports.",
      },
    ],
  },
  {
    id: "governance",
    title: "Governance & Administration",
    description: "User provisioning, security policies, and HIPAA compliance audit trails.",
    permissions: [
      {
        key: "users:manage",
        label: "User & Role Management",
        description: "Invite users, assign roles, and modify fine-grained privileges.",
      },
      {
        key: "roles:manage",
        label: "Edit Privileges Matrix",
        description: "Configure system-wide permissions matrices and policy bundles.",
      },
      {
        key: "audit:view",
        label: "Audit Logs & Security",
        description: "Review tamper-evident audit logs and access tracking records.",
      },
      {
        key: "tenant:configure",
        label: "Tenant Configuration",
        description: "Modify organization branding, EHR connectors, and security rules.",
      },
    ],
  },
];

/** Default permission assignments per role */
export const DEFAULT_ROLE_PERMISSIONS = {
  [ROLES.PLATFORM_ADMIN]: [
    "phi:read", "phi:write", "care:manage", "vitals:view",
    "coding:worklist", "coding:chase", "coding:validate", "raf:view",
    "rides:book", "rides:manage", "jobs:manage",
    "analytics:view", "capitation:view", "reports:export",
    "users:manage", "roles:manage", "audit:view", "tenant:configure"
  ],
  [ROLES.ADMIN]: [
    "phi:read", "phi:write", "care:manage", "vitals:view",
    "coding:worklist", "coding:chase", "coding:validate", "raf:view",
    "rides:book", "rides:manage", "jobs:manage",
    "analytics:view", "capitation:view", "reports:export",
    "users:manage", "roles:manage", "audit:view", "tenant:configure"
  ],
  [ROLES.CLINICIAN]: [
    "phi:read", "phi:write", "care:manage", "vitals:view",
    "coding:worklist", "raf:view",
    "rides:book",
    "analytics:view", "reports:export"
  ],
  [ROLES.NURSE]: [
    "phi:read", "care:manage", "vitals:view",
    "rides:book", "rides:manage",
    "analytics:view"
  ],
  [ROLES.CODER]: [
    "phi:read",
    "coding:worklist", "coding:chase", "coding:validate", "raf:view",
    "analytics:view", "reports:export"
  ],
  [ROLES.BILLING]: [
    "raf:view",
    "analytics:view", "capitation:view", "reports:export"
  ],
  [ROLES.PATIENT]: [
    "vitals:view",
    "rides:book"
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
    name: "Elena Martinez, RN",
    title: "Lead Care Coordinator",
    email: "elena.nurse@prominencehealth.com",
    department: "Population Care Management",
    avatar: "EM",
  },
  {
    role: ROLES.CODER,
    name: "Marcus Cole, CPC, CRC",
    title: "Senior Risk Adjustment Coder",
    email: "marcus.coder@prominencehealth.com",
    department: "Risk Adjustment & Coding",
    avatar: "MC",
  },
  {
    role: ROLES.BILLING,
    name: "Rachel Adams",
    title: "Director of Value-Based Finance",
    email: "rachel.billing@prominencehealth.com",
    department: "Capitation & Finance",
    avatar: "RA",
  },
  {
    role: ROLES.PATIENT,
    name: "James Wilson",
    title: "Enrolled Member / Patient",
    email: "james.member@prominencehealth.com",
    department: "Medicare Advantage Plan",
    avatar: "JW",
  },
];
