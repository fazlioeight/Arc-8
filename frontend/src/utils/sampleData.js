import { DEFAULT_APPLICATIONS, DEFAULT_TENANTS } from '../context/AuthContext';

export const SAMPLE_SESSION = {
  email: 'chief.admin@nexora.ai',
  name: 'Chief Admin',
  role: 'platform_admin',
  tenant: 'demo',
  tenants: DEFAULT_TENANTS,
  applications: {
    ...DEFAULT_APPLICATIONS,
    ride_booking: 'admin',
  },
  purchased_applications: ['portal', 'dashboard', 'coding', 'ride_booking', 'docs', 'settings', 'job_center', 'admin_console'],
  available_applications: ['portal', 'dashboard', 'coding', 'ride_booking', 'docs', 'settings', 'job_center', 'admin_console'],
  token: 'sample-demo-token',
};

export const SAMPLE_CODING_MEMBERS = [
  {
    id: 'mem-001',
    first_name: 'Jordan',
    last_name: 'Anders',
    member_key: 'DEM1001',
    status: 'active',
    line_of_business: 'Medicare Advantage',
    pcp_name: 'Dr. Priya Patel',
    pcp_npi: '1285760090',
  },
  {
    id: 'mem-002',
    first_name: 'Alicia',
    last_name: 'Greene',
    member_key: 'DEM1002',
    status: 'in_review',
    line_of_business: 'Commercial',
    pcp_name: 'Dr. Noel Chen',
    pcp_npi: '1800354999',
  },
  {
    id: 'mem-003',
    first_name: 'Mason',
    last_name: 'Rivera',
    member_key: 'DEM1003',
    status: 'active',
    line_of_business: 'DSNP',
    pcp_name: 'Dr. Amara Shah',
    pcp_npi: '1598844101',
  },
  {
    id: 'mem-004',
    first_name: 'Isla',
    last_name: 'Hendrix',
    member_key: 'DEM1004',
    status: 'closed',
    line_of_business: 'Commercial',
    pcp_name: 'Dr. Michael Lang',
    pcp_npi: '1942770102',
  },
  {
    id: 'mem-005',
    first_name: 'Darius',
    last_name: 'Lee',
    member_key: 'DEM1005',
    status: 'in_review',
    line_of_business: 'Medicare Advantage',
    pcp_name: 'Dr. Helena Ortiz',
    pcp_npi: '1093776605',
  },
  {
    id: 'mem-006',
    first_name: 'Fatima',
    last_name: 'Ward',
    member_key: 'DEM1006',
    status: 'active',
    line_of_business: 'Exchange',
    pcp_name: 'Dr. Matteo Rossi',
    pcp_npi: '1456771204',
  },
];

export const SAMPLE_JOBS = [
  {
    id: 'job-001',
    name: 'Medicare roster import',
    type: 'import',
    status: 'completed',
    progress: 100,
    startedAt: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
    finishedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    tenant: 'demo',
    initiatedBy: 'chief.admin@nexora.ai',
    recordsProcessed: 5120,
    recordsSucceeded: 5078,
    recordsFailed: 42,
    canRetry: false,
  },
  {
    id: 'job-002',
    name: 'RAF refresh',
    type: 'model_run',
    status: 'running',
    progress: 68,
    startedAt: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
    finishedAt: null,
    tenant: 'sunrise',
    initiatedBy: 'actuary.sunrise@nexora.ai',
    recordsProcessed: 1873,
    recordsSucceeded: 1873,
    recordsFailed: 0,
    canRetry: false,
  },
  {
    id: 'job-003',
    name: 'Coding queue export',
    type: 'export',
    status: 'failed',
    progress: 32,
    startedAt: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
    finishedAt: new Date(Date.now() - 1000 * 60 * 62).toISOString(),
    tenant: 'lakeside',
    initiatedBy: 'ops.lakeside@nexora.ai',
    recordsProcessed: 932,
    recordsSucceeded: 624,
    recordsFailed: 308,
    canRetry: true,
    error: 'Destination S3 bucket rejected upload: missing encryption policy.',
  },
  {
    id: 'job-004',
    name: 'Transportation manifest sync',
    type: 'sync',
    status: 'queued',
    progress: 0,
    startedAt: null,
    finishedAt: null,
    tenant: 'sunrise',
    initiatedBy: 'dispatch.sunrise@nexora.ai',
    recordsProcessed: 0,
    recordsSucceeded: 0,
    recordsFailed: 0,
    canRetry: false,
  },
];

export const SAMPLE_JOB_LOGS = {
  'job-001': [
    { ts: '05:05', line: 'Validating intake schema (v3.1)...' },
    { ts: '05:08', line: 'Schema validated. Beginning ingest of 5,120 rows.' },
    { ts: '05:22', line: 'Ingest completed. Dur=00:14:32. 42 records quarantined for review.' },
  ],
  'job-002': [
    { ts: '11:02', line: 'Bootstrap RAF factors for tenant sunrise...' },
    { ts: '11:04', line: 'Running inference batch 2/3 (segment ESRD).' },
  ],
  'job-003': [
    { ts: '01:12', line: 'Export starting: Lakeside coding queue (913 records).' },
    { ts: '01:18', line: 'Network warning – retrying upload (attempt 2).' },
    { ts: '01:21', line: 'Export failed. S3 responded AccessDenied (policy mismatch).' },
  ],
  'job-004': [
    { ts: 'Pending', line: 'Job is waiting on upstream authorization from Ride Partner API.' },
  ],
};

export const SAMPLE_TENANT_COMMENTS = {
  demo: 'Nexora sandbox tenant with synthetic CMS sample data.',
  sunrise: 'Regional clinic network focusing on type 2 diabetes cohorts.',
  lakeside: 'ACO pilot site using Nexora for HEDIS gap closure.',
};

export const SAMPLE_ADMIN_APPLICATIONS = [
  { key: 'portal', label: 'Portal Overview', description: 'Tenant home with key KPIs and announcements.', core: true, purchased: true },
  { key: 'dashboard', label: 'Analytics Dashboard', description: 'Deep dives into BUR, RAF, and quality metrics.', core: false, purchased: true },
  { key: 'coding', label: 'Coding Worklists', description: 'Manage chart reviews and coder assignments.', core: false, purchased: true },
  { key: 'ride_booking', label: 'Ride Booking', description: 'Coordinate member transportation and partner dispatch.', core: false, purchased: true },
  { key: 'job_center', label: 'Job Center', description: 'Monitor imports, exports, and model runs.', core: false, purchased: true },
  { key: 'docs', label: 'Docs Library', description: 'Internal documentation and SOPs.', core: false, purchased: true },
  { key: 'admin_console', label: 'Master Admin', description: 'Manage users, roles, and tenant branding.', core: true, purchased: true },
  { key: 'settings', label: 'Settings', description: 'Configure preferences and integrations.', core: true, purchased: true },
];

export const SAMPLE_ADMIN_USERS = [
  {
    id: 'sample-admin-root',
    email: 'alex.admin@nexora.ai',
    role: 'platform_admin',
    is_active: true,
    applications: {
      portal: 'admin',
      dashboard: 'admin',
      coding: 'admin',
      ride_booking: 'manager',
      job_center: 'admin',
      docs: 'user',
      admin_console: 'admin',
    },
  },
  {
    id: 'sample-manager',
    email: 'maya.manager@nexora.ai',
    role: 'user',
    is_active: true,
    applications: {
      portal: 'user',
      dashboard: 'user',
      coding: 'user',
      ride_booking: 'user',
      job_center: 'user',
      docs: 'user',
      admin_console: 'none',
    },
  },
  {
    id: 'sample-ops',
    email: 'sam.ops@nexora.ai',
    role: 'user',
    is_active: false,
    applications: {
      portal: 'user',
      dashboard: 'user',
      coding: 'none',
      ride_booking: 'admin',
      job_center: 'user',
      docs: 'user',
      admin_console: 'none',
    },
  },
];

export const sampleDownload = (jobId) => {
  const payload = {
    jobId,
    exportedAt: new Date().toISOString(),
    generatedBy: 'Nexora Sample Exporter',
    rows: Array.from({ length: 5 }, (_, idx) => ({
      id: `${jobId}-row-${idx + 1}`,
      status: idx % 2 === 0 ? 'ok' : 'quarantined',
      detail: 'Synthetic row for sample export',
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${jobId}-sample-export.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

