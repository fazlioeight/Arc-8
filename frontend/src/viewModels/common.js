const toNumberOrNull = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toStringOrNull = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
};

const mapChaseToView = (chase) => {
  if (!chase) return null;
  const chaseId = chase.chase_id ?? chase.chaseId ?? chase.id;
  const memberId = chase.member_id ?? chase.memberId ?? null;
  const dueDate = chase.due_date ?? chase.dueDate ?? null;
  const serviceFrom = chase.service_date_from ?? chase.serviceDateFrom ?? null;
  const serviceTo = chase.service_date_to ?? chase.serviceDateTo ?? null;
  const icd10Code = chase.icd10_code ?? chase.icd10Code ?? null;
  const hccCode = chase.hcc_code ?? chase.hccCode ?? null;
  const assignedEmail = chase.assigned_coder_email ?? chase.assignedCoderEmail ?? null;
  return {
    id: chaseId,
    chaseId,
    chase_id: chaseId,
    memberId,
    member_id: memberId,
    status: chase.status || "open",
    priority: chase.priority || null,
    assignedCoderEmail: assignedEmail,
    assigned_coder_email: assignedEmail,
    dueDate,
    due_date: dueDate,
    serviceDateFrom: serviceFrom,
    service_date_from: serviceFrom,
    serviceDateTo: serviceTo,
    service_date_to: serviceTo,
    icd10Code,
    icd10_code: icd10Code,
    hccCode,
    hcc_code: hccCode,
    updatedAt: chase.updated_at ?? chase.updatedAt ?? null,
    updated_at: chase.updated_at ?? chase.updatedAt ?? null,
  };
};

export const createMemberSummary = (raw) => {
  if (!raw) return null;
  const id = raw.id ?? raw.member_id ?? raw.memberId ?? raw.member_key ?? raw.memberKey ?? null;
  const memberKey = raw.member_key ?? raw.memberKey ?? raw.memberId ?? raw.id ?? raw.member_id ?? null;
  const firstName = raw.first_name ?? raw.firstName ?? null;
  const lastName = raw.last_name ?? raw.lastName ?? null;
  const dob = raw.dob ?? raw.date_of_birth ?? raw.dateOfBirth ?? null;
  const riskScore = raw.risk_score ?? raw.riskScore;
  const assignedCoderIds = raw.assigned_coder_ids ?? raw.assignedCoderIds ?? [];
  const assignedCoderEmails = raw.assigned_coder_emails ?? raw.assignedCoderEmails ?? [];
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
  const planName = raw.plan_name ?? raw.planName ?? null;
  const riskTier = raw.risk_tier ?? raw.riskTier ?? null;

  const mapped = {
    id,
    memberId: id,
    member_id: id,
    memberKey,
    member_key: memberKey,
    firstName,
    first_name: firstName,
    lastName,
    last_name: lastName,
    dob,
    dateOfBirth: dob,
    date_of_birth: dob,
    status: raw.status || "unknown",
    planName,
    plan_name: planName,
    riskTier,
    risk_tier: riskTier,
    lineOfBusiness: raw.line_of_business ?? raw.lineOfBusiness ?? null,
    line_of_business: raw.line_of_business ?? raw.lineOfBusiness ?? null,
    riskScore: toNumberOrNull(riskScore),
    risk_score: toNumberOrNull(riskScore),
    pcpName: raw.pcp_name ?? raw.pcpName ?? null,
    pcp_name: raw.pcp_name ?? raw.pcpName ?? null,
    pcpNpi: raw.pcp_npi ?? raw.pcpNpi ?? null,
    pcp_npi: raw.pcp_npi ?? raw.pcpNpi ?? null,
    assignedCoderIds,
    assigned_coder_ids: assignedCoderIds,
    assignedCoderEmails,
    assigned_coder_emails: assignedCoderEmails,
    fullName,
  };

  return mapped;
};

export const createMemberDetail = (payload) => {
  if (!payload) return null;
  const memberPayload = payload.member || payload;
  const summary = createMemberSummary(memberPayload);
  const dateOfBirth = memberPayload.date_of_birth ?? memberPayload.dateOfBirth ?? memberPayload.dob ?? summary?.dateOfBirth ?? null;

  return {
    ...summary,
    dateOfBirth,
    date_of_birth: dateOfBirth,
    gender: memberPayload.gender ?? null,
    primaryLanguage: memberPayload.primary_language ?? memberPayload.primaryLanguage ?? null,
    primary_language: memberPayload.primary_language ?? memberPayload.primaryLanguage ?? null,
    lastContactedAt: memberPayload.last_contacted_at ?? memberPayload.lastContactedAt ?? null,
    last_contacted_at: memberPayload.last_contacted_at ?? memberPayload.lastContactedAt ?? null,
    addressCity: memberPayload.address_city ?? memberPayload.addressCity ?? null,
    address_city: memberPayload.address_city ?? memberPayload.addressCity ?? null,
    addressState: memberPayload.address_state ?? memberPayload.addressState ?? null,
    address_state: memberPayload.address_state ?? memberPayload.addressState ?? null,
    addressZip: memberPayload.address_zip ?? memberPayload.addressZip ?? null,
    address_zip: memberPayload.address_zip ?? memberPayload.addressZip ?? null,
    eligibility: payload.eligibility ?? null,
    chases: Array.isArray(payload.chases) ? payload.chases.map(mapChaseToView).filter(Boolean) : [],
    notes: Array.isArray(payload.notes) ? payload.notes : [],
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    claims: Array.isArray(payload.claims) ? payload.claims : [],
    maoRecords: Array.isArray(payload.mao_records) ? payload.mao_records : [],
    mao_records: Array.isArray(payload.mao_records) ? payload.mao_records : [],
    healthAssessments: Array.isArray(payload.health_assessments) ? payload.health_assessments : [],
    health_assessments: Array.isArray(payload.health_assessments) ? payload.health_assessments : [],
    priority: payload.priority ?? null,
  };
};

export const createWorklistItem = (raw) => {
  if (!raw) return null;
  const chaseId = raw.chase_id ?? raw.chaseId ?? raw.id;
  const memberId = raw.member_id ?? raw.memberId ?? null;
  const memberKey = raw.member_key ?? raw.memberKey ?? null;
  const memberName =
    raw.member_name ||
    raw.memberName ||
    raw.member ||
    [raw.first_name, raw.last_name].filter(Boolean).join(" ").trim() ||
    null;

  return {
    chaseId,
    chase_id: chaseId,
    memberId,
    member_id: memberId,
    memberKey,
    member_key: memberKey,
    memberName,
    member_name: memberName,
    status: raw.status || "open",
    priority: raw.priority || null,
    assignedCoderEmail: raw.assigned_coder_email ?? raw.assignedCoderEmail ?? null,
    assigned_coder_email: raw.assigned_coder_email ?? raw.assignedCoderEmail ?? null,
    icd10Code: raw.icd10_code ?? raw.icd10Code ?? null,
    icd10_code: raw.icd10_code ?? raw.icd10Code ?? null,
    hccCode: raw.hcc_code ?? raw.hccCode ?? null,
    hcc_code: raw.hcc_code ?? raw.hccCode ?? null,
    serviceDateFrom: raw.service_date_from ?? raw.serviceDateFrom ?? null,
    service_date_from: raw.service_date_from ?? raw.serviceDateFrom ?? null,
    serviceDateTo: raw.service_date_to ?? raw.serviceDateTo ?? null,
    service_date_to: raw.service_date_to ?? raw.serviceDateTo ?? null,
    dueDate: raw.due_date ?? raw.dueDate ?? null,
    due_date: raw.due_date ?? raw.dueDate ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
    updated_at: raw.updated_at ?? raw.updatedAt ?? null,
  };
};

export const createWorklistSummary = (raw) => {
  if (!raw) {
    return { statusCounts: {}, priorityCounts: {}, dueSoon: 0, overdue: 0 };
  }
  return {
    statusCounts: raw.status_counts ?? raw.statusCounts ?? {},
    priorityCounts: raw.priority_counts ?? raw.priorityCounts ?? {},
    dueSoon: raw.due_soon ?? raw.dueSoon ?? 0,
    overdue: raw.overdue ?? 0,
  };
};

const createPortalProfile = (raw = {}) => ({
  email: raw.email ?? null,
  tenant: raw.tenant ?? null,
  role: raw.role ?? null,
  lastLogin: raw.last_login ?? raw.lastLogin ?? null,
});

const createPortalApplication = (raw = {}, catalog = []) => {
  const key = raw.key ?? raw.app_key ?? raw.id ?? null;
  const catalogEntry = key ? catalog.find((entry) => entry.key === key) || {} : {};
  const resolvedKey = key ?? catalogEntry.key ?? "unknown";
  return {
    key: resolvedKey,
    label: raw.label ?? catalogEntry.label ?? resolvedKey,
    desc: raw.desc ?? raw.description ?? catalogEntry.desc ?? "",
    path: raw.path ?? catalogEntry.path ?? "/",
    icon: raw.icon ?? catalogEntry.icon ?? resolvedKey.slice(0, 2).toUpperCase(),
    color: raw.color ?? catalogEntry.color ?? "#0f172a",
    level: raw.level ?? catalogEntry.level ?? null,
    allowed:
      raw.allowed ?? catalogEntry.allowed ?? (catalogEntry.requiredLevel === "admin" ? false : true),
  };
};

const createPortalSavedItem = (raw = {}) => ({
  id: raw.id ?? raw.key ?? toStringOrNull(raw.title) ?? "unknown",
  title: raw.title ?? "Untitled",
  summary: raw.summary ?? "",
  appKey: raw.appKey ?? raw.app_key ?? null,
  savedAt: raw.savedAt ?? raw.saved_at ?? null,
  path: raw.path ?? null,
});

const createPortalTodo = (raw = {}) => ({
  id: raw.id ?? raw.key ?? toStringOrNull(raw.title) ?? "todo",
  title: raw.title ?? "To-do",
  appKey: raw.appKey ?? raw.app_key ?? null,
  assignedBy: raw.assignedBy ?? raw.assigned_by ?? null,
  dueAt: raw.dueAt ?? raw.due_at ?? null,
  priority: raw.priority ?? "low",
  path: raw.path ?? null,
});

export const createPortalOverview = (payload = {}, { catalog = [], fallback } = {}) => {
  const baseProfile = payload.profile || fallback?.profile || {};
  const normalizedProfile = createPortalProfile(baseProfile);

  const apiApplications = Array.isArray(payload.applications) ? payload.applications : [];
  const fallbackApplications = Array.isArray(fallback?.applications) ? fallback.applications : [];
  const applicationsSource = apiApplications.length ? apiApplications : fallbackApplications;
  const applications = applicationsSource.map((app) => createPortalApplication(app, catalog));

  const apiLastSaved = Array.isArray(payload.lastSaved)
    ? payload.lastSaved
    : Array.isArray(payload.last_saved)
    ? payload.last_saved
    : [];
  const fallbackLastSaved = Array.isArray(fallback?.lastSaved) ? fallback.lastSaved : [];
  const lastSavedSource = apiLastSaved.length ? apiLastSaved : fallbackLastSaved;
  const lastSaved = lastSavedSource.map(createPortalSavedItem);

  const apiTodos = Array.isArray(payload.todos) ? payload.todos : [];
  const fallbackTodos = Array.isArray(fallback?.todos) ? fallback.todos : [];
  const todosSource = apiTodos.length ? apiTodos : fallbackTodos;
  const todos = todosSource.map(createPortalTodo);

  return {
    loading: Boolean(payload.loading),
    error: payload.error ?? null,
    profile: normalizedProfile,
    applications,
    lastSaved,
    todos,
  };
};
