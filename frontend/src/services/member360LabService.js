const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const shouldUseSample = (token) => {
  if (!token) return true;
  const value = String(token).toLowerCase();
  return value.startsWith('sample');
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const buildHeaders = (token, tenant) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
});

const toQuery = (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else qs.append(key, value);
  });
  const q = qs.toString();
  return q ? `?${q}` : '';
};

const handleResponse = async (res) => {
  if (res.status === 401 || res.status === 403) throw new Error('Unauthorized');
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = body?.detail || res.statusText;
    throw new Error(detail);
  }
  return body;
};

// ------------------- Sample store -------------------
const sampleStores = new Map();
const SAMPLE_LIMIT = 5;

const isoDaysFromNow = (days) => new Date(Date.now() + days * 86400000).toISOString();
const dateOnly = (iso) => iso.slice(0, 10);

const ageFromDob = (dob) => {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
};

const buildSampleData = () => {
  const today = new Date();
  const baseMembers = [
    {
      member_key: 'M360-0001', first_name: 'Maria', last_name: 'Hernandez',
      date_of_birth: '1956-03-12', gender: 'Female',
      plan_name: 'ProminenceCare Gold', line_of_business: 'Medicare Advantage',
      phone: '(702) 555-0142', email: 'maria.hernandez@example.com',
      address_line1: '1245 Charleston Blvd', address_city: 'Las Vegas',
      address_state: 'NV', address_zip: '89102',
      preferred_language: 'Spanish', preferred_channel: 'Phone',
      primary_care_provider: 'Dr. Aaron Whitley',
      risk_score_composite: 8.6, risk_tier: 'Critical',
      clinical_risk_score: 9.1, utilization_risk_score: 8.2,
      cost_risk_score: 8.8, engagement_risk_score: 5.3,
      open_care_gaps: 4, next_best_action: 'Schedule cardiology follow-up',
    },
    {
      member_key: 'M360-0002', first_name: 'James', last_name: "O'Connell",
      date_of_birth: '1962-08-04', gender: 'Male',
      plan_name: 'ProminenceCare Silver', line_of_business: 'Medicare Advantage',
      phone: '(702) 555-0188', email: 'james.oconnell@example.com',
      address_city: 'Reno', address_state: 'NV', address_zip: '89509',
      preferred_language: 'English', preferred_channel: 'SMS',
      primary_care_provider: 'Dr. Priya Shah',
      risk_score_composite: 7.4, risk_tier: 'High',
      clinical_risk_score: 7.9, utilization_risk_score: 7.0,
      cost_risk_score: 6.5, engagement_risk_score: 4.0,
      open_care_gaps: 3, next_best_action: 'Imaging steerage opportunity (MRI)',
    },
    {
      member_key: 'M360-0003', first_name: 'Linda', last_name: 'Pham',
      date_of_birth: '1971-11-22', gender: 'Female',
      plan_name: 'ProminenceCare PPO', line_of_business: 'Commercial',
      phone: '(415) 555-0117', email: 'linda.pham@example.com',
      address_city: 'San Jose', address_state: 'CA', address_zip: '95110',
      preferred_channel: 'Secure Message',
      primary_care_provider: 'Dr. Marcus Lee',
      risk_score_composite: 6.1, risk_tier: 'High',
      clinical_risk_score: 6.7, utilization_risk_score: 5.5,
      cost_risk_score: 6.3, engagement_risk_score: 6.4,
      open_care_gaps: 2, next_best_action: 'Confirm diabetes care plan',
    },
    {
      member_key: 'M360-0004', first_name: 'Robert', last_name: 'Carter',
      date_of_birth: '1980-05-30', gender: 'Male',
      plan_name: 'ProminenceCare HMO', line_of_business: 'Commercial',
      phone: '(415) 555-0103', email: 'robert.carter@example.com',
      address_city: 'Oakland', address_state: 'CA', address_zip: '94612',
      preferred_channel: 'Chat',
      primary_care_provider: 'Dr. Sandra Yi',
      risk_score_composite: 4.2, risk_tier: 'Moderate',
      clinical_risk_score: 4.0, utilization_risk_score: 4.5,
      cost_risk_score: 4.1, engagement_risk_score: 5.2,
      open_care_gaps: 1, next_best_action: 'Annual wellness visit',
    },
    {
      member_key: 'M360-0005', first_name: 'Emily', last_name: 'Nakamura',
      date_of_birth: '1993-01-18', gender: 'Female',
      plan_name: 'ProminenceCare PPO', line_of_business: 'Commercial',
      phone: '(702) 555-0211', email: 'emily.nakamura@example.com',
      address_city: 'Henderson', address_state: 'NV', address_zip: '89014',
      preferred_channel: 'Chat',
      primary_care_provider: 'Dr. Aaron Whitley',
      risk_score_composite: 2.1, risk_tier: 'Low',
      clinical_risk_score: 2.0, utilization_risk_score: 2.4,
      cost_risk_score: 2.0, engagement_risk_score: 7.5,
      open_care_gaps: 0, next_best_action: 'Send preventive care reminder',
    },
    {
      member_key: 'M360-0006', first_name: 'Daniel', last_name: 'Adeyemi',
      date_of_birth: '1949-09-08', gender: 'Male',
      plan_name: 'ProminenceCare Gold', line_of_business: 'Medicare Advantage',
      phone: '(702) 555-0144', email: 'daniel.adeyemi@example.com',
      address_city: 'Sparks', address_state: 'NV', address_zip: '89431',
      preferred_channel: 'Phone',
      primary_care_provider: 'Dr. Priya Shah',
      risk_score_composite: 8.9, risk_tier: 'Critical',
      clinical_risk_score: 9.3, utilization_risk_score: 8.7,
      cost_risk_score: 9.0, engagement_risk_score: 3.2,
      open_care_gaps: 5, next_best_action: 'Urgent: post-ED outreach',
    },
    {
      member_key: 'M360-0007', first_name: 'Sophia', last_name: 'Rivera',
      date_of_birth: '1968-02-14', gender: 'Female',
      plan_name: 'ProminenceCare Silver', line_of_business: 'Medicare Advantage',
      phone: '(702) 555-0177', email: 'sophia.rivera@example.com',
      address_city: 'Las Vegas', address_state: 'NV', address_zip: '89148',
      preferred_channel: 'Phone',
      primary_care_provider: 'Dr. Marcus Lee',
      risk_score_composite: 5.8, risk_tier: 'Moderate',
      clinical_risk_score: 5.6, utilization_risk_score: 6.0,
      cost_risk_score: 5.5, engagement_risk_score: 6.1,
      open_care_gaps: 2, next_best_action: 'Confirm imaging steerage',
    },
    {
      member_key: 'M360-0008', first_name: 'Michael', last_name: 'Stewart',
      date_of_birth: '1955-07-25', gender: 'Male',
      plan_name: 'ProminenceCare Gold', line_of_business: 'Medicare Advantage',
      phone: '(702) 555-0199', email: 'michael.stewart@example.com',
      address_city: 'Reno', address_state: 'NV', address_zip: '89502',
      preferred_channel: 'SMS',
      primary_care_provider: 'Dr. Sandra Yi',
      risk_score_composite: 7.0, risk_tier: 'High',
      clinical_risk_score: 7.4, utilization_risk_score: 6.8,
      cost_risk_score: 6.9, engagement_risk_score: 5.6,
      open_care_gaps: 3, next_best_action: 'Schedule comprehensive assessment',
    },
  ];

  const members = baseMembers.map((m, idx) => ({
    ...m,
    id: idx + 1,
    age: ageFromDob(m.date_of_birth),
    open_task_count: 0,
    active_journey_count: 0,
    last_interaction_at: isoDaysFromNow(-2 - idx),
  }));

  const insightSpecs = [
    { domain: 'Clinical', driver: 'Uncontrolled HbA1c trend (>9)', recommendation: 'Schedule diabetes coaching', confidence: 0.92 },
    { domain: 'Utilization', driver: '2 ED visits in last 90 days', recommendation: 'Care manager outreach within 48h', confidence: 0.88 },
    { domain: 'Cost', driver: 'Imaging cost variance vs network median', recommendation: 'Steerage to lower-cost facility', confidence: 0.81 },
    { domain: 'Engagement', driver: 'No outbound contact in 60 days', recommendation: 'Try preferred channel and language', confidence: 0.74 },
  ];

  const riskInsights = {};
  members.forEach((m) => {
    riskInsights[m.id] = insightSpecs.map((spec, idx) => ({
      id: m.id * 10 + idx,
      domain: spec.domain,
      score: {
        Clinical: m.clinical_risk_score,
        Utilization: m.utilization_risk_score,
        Cost: m.cost_risk_score,
        Engagement: m.engagement_risk_score,
      }[spec.domain],
      driver: spec.driver,
      recommendation: spec.recommendation,
      confidence: spec.confidence,
      last_updated_at: isoDaysFromNow(-idx),
    }));
  });

  const templates = [
    { id: 1, name: 'High-Risk Member Outreach', description: 'Structured engagement for high/critical risk members.', category: 'Risk Management', recommended_for_risk_tier: 'High',
      default_stages: [{ name: 'Identify drivers' }, { name: 'Initial outreach' }, { name: 'Care plan' }, { name: 'Follow-up' }],
      default_tasks: [{ title: 'Call member', priority: 'high' }] },
    { id: 2, name: 'Post-Discharge Follow-Up', description: '48-72 hour outreach after inpatient discharge.', category: 'Transitions of Care', recommended_for_risk_tier: 'Moderate',
      default_stages: [{ name: 'Discharge review' }, { name: 'Outreach call' }, { name: 'Med reconciliation' }],
      default_tasks: [{ title: 'Call after discharge', priority: 'urgent' }] },
    { id: 3, name: 'Imaging Steerage', description: 'Guide member to lower-cost, high-quality imaging.', category: 'Care Options', recommended_for_risk_tier: 'Moderate',
      default_stages: [{ name: 'Confirm order' }, { name: 'Present options' }, { name: 'Schedule' }],
      default_tasks: [{ title: 'Discuss imaging options', priority: 'high' }] },
    { id: 4, name: 'Chronic Condition Review', description: 'Quarterly review of chronic condition management.', category: 'Chronic Care', recommended_for_risk_tier: 'High',
      default_stages: [{ name: 'Review claims' }, { name: 'Outreach' }, { name: 'PCP coordination' }],
      default_tasks: [{ title: 'Review trends', priority: 'medium' }] },
    { id: 5, name: 'Preventive Care Gap Closure', description: 'Close preventive care gaps.', category: 'Preventive', recommended_for_risk_tier: 'Low',
      default_stages: [{ name: 'Identify gaps' }, { name: 'Outreach' }, { name: 'Verify closure' }],
      default_tasks: [{ title: 'Outreach for preventive visit', priority: 'medium' }] },
  ];

  const careJourneys = {
    1: [{ id: 11, member_id: 1, name: 'High-Risk Member Outreach', description: 'Critical risk engagement.', status: 'active', template_name: 'High-Risk Member Outreach', source: 'seed', assigned_to: 'admin@admin.com', created_by: 'seed', start_date: dateOnly(isoDaysFromNow(-5)), target_completion_date: dateOnly(isoDaysFromNow(21)),
        stages: [
          { id: 111, sequence: 0, name: 'Identify drivers', status: 'complete', completed_at: isoDaysFromNow(-3) },
          { id: 112, sequence: 1, name: 'Initial outreach', status: 'in_progress' },
          { id: 113, sequence: 2, name: 'Care plan', status: 'pending' },
          { id: 114, sequence: 3, name: 'Follow-up', status: 'pending' },
        ], open_task_count: 1 }],
    2: [{ id: 21, member_id: 2, name: 'Imaging Steerage', description: 'MRI steerage.', status: 'active', template_name: 'Imaging Steerage', source: 'seed', assigned_to: 'admin@admin.com', created_by: 'seed', start_date: dateOnly(isoDaysFromNow(-2)), target_completion_date: dateOnly(isoDaysFromNow(7)),
        stages: [
          { id: 211, sequence: 0, name: 'Confirm order', status: 'complete', completed_at: isoDaysFromNow(-1) },
          { id: 212, sequence: 1, name: 'Present options', status: 'in_progress' },
          { id: 213, sequence: 2, name: 'Schedule', status: 'pending' },
        ], open_task_count: 1 }],
    6: [{ id: 61, member_id: 6, name: 'Post-Discharge Follow-Up', description: 'After ED admission.', status: 'active', template_name: 'Post-Discharge Follow-Up', source: 'seed', assigned_to: 'admin@admin.com', created_by: 'seed', start_date: dateOnly(isoDaysFromNow(-1)), target_completion_date: dateOnly(isoDaysFromNow(5)),
        stages: [
          { id: 611, sequence: 0, name: 'Discharge review', status: 'complete', completed_at: isoDaysFromNow(0) },
          { id: 612, sequence: 1, name: 'Outreach call', status: 'in_progress' },
          { id: 613, sequence: 2, name: 'Med reconciliation', status: 'pending' },
        ], open_task_count: 1 }],
    8: [{ id: 81, member_id: 8, name: 'Chronic Condition Review', description: 'Quarterly chronic review.', status: 'active', template_name: 'Chronic Condition Review', source: 'seed', assigned_to: 'admin@admin.com', created_by: 'seed', start_date: dateOnly(isoDaysFromNow(-7)), target_completion_date: dateOnly(isoDaysFromNow(30)),
        stages: [
          { id: 811, sequence: 0, name: 'Review claims', status: 'complete', completed_at: isoDaysFromNow(-4) },
          { id: 812, sequence: 1, name: 'Outreach', status: 'in_progress' },
          { id: 813, sequence: 2, name: 'PCP coordination', status: 'pending' },
        ], open_task_count: 1 }],
  };

  const taskSeed = [
    { member_id: 1, title: 'Call member re: cardiology follow-up', priority: 'urgent', status: 'open',
      sbar_situation: 'Member identified as critical risk with uncontrolled CHF.',
      sbar_background: 'Two CHF-related ED visits in past 6 months; missed cardiology follow-up.',
      sbar_assessment: 'High likelihood of decompensation without near-term intervention.',
      sbar_recommendation: 'Outbound call today, escalate to RN if no answer.',
      auto_generated_reason: 'Auto-prioritized due to Critical risk tier' },
    { member_id: 2, title: 'Discuss MRI imaging steerage', priority: 'high', status: 'open',
      sbar_situation: 'Member calling about MRI options for shoulder.',
      sbar_background: 'PCP ordered MRI; member on PPO with $850 deductible remaining.',
      sbar_assessment: 'Steered facility saves est. $620 with equal quality score.',
      sbar_recommendation: 'Send care option report and SMS link to scheduling.',
      auto_generated_reason: 'Imaging steerage opportunity detected on inbound call' },
    { member_id: 3, title: 'Confirm diabetes care plan', priority: 'medium', status: 'in_progress',
      sbar_situation: 'Type 2 diabetes management review.',
      sbar_background: 'HbA1c trending up; last reading 8.4.',
      sbar_assessment: 'Medication adherence gap.',
      sbar_recommendation: 'Coordinate with PCP and schedule diabetes coach.' },
    { member_id: 6, title: 'Urgent post-ED outreach', priority: 'urgent', status: 'open',
      sbar_situation: 'Member discharged from ED 24 hours ago.',
      sbar_background: 'ED visit for chest pain; admitted overnight.',
      sbar_assessment: 'Risk of readmission elevated.',
      sbar_recommendation: 'Call within next 12 hours to verify med reconciliation.',
      auto_generated_reason: 'Post-discharge automation triggered' },
    { member_id: 8, title: 'Schedule comprehensive assessment', priority: 'high', status: 'open',
      sbar_situation: 'New high-risk identification.',
      sbar_background: 'Multiple chronic conditions, missed last AWV.',
      sbar_assessment: 'Comprehensive assessment overdue.',
      sbar_recommendation: 'Offer in-home assessment as primary option.',
      auto_generated_reason: 'AI flagged: chronic care review template recommended' },
  ];
  const tasks = {};
  taskSeed.forEach((t, idx) => {
    const id = 100 + idx;
    const member = members.find((m) => m.id === t.member_id);
    const taskObj = {
      id,
      member_id: t.member_id,
      journey_id: null,
      title: t.title,
      description: null,
      assigned_user: 'admin@admin.com',
      assigned_queue: 'Care Coordination',
      priority: t.priority,
      status: t.status,
      due_date: dateOnly(isoDaysFromNow(2)),
      sbar: {
        situation: t.sbar_situation,
        background: t.sbar_background,
        assessment: t.sbar_assessment,
        recommendation: t.sbar_recommendation,
      },
      recommended_next_action: t.sbar_recommendation,
      auto_generated_reason: t.auto_generated_reason || null,
      notes: null,
      created_at: isoDaysFromNow(-idx),
      updated_at: isoDaysFromNow(-idx),
      member_name: member ? `${member.first_name} ${member.last_name}` : null,
      risk_tier: member?.risk_tier || null,
    };
    if (!tasks[t.member_id]) tasks[t.member_id] = [];
    tasks[t.member_id].push(taskObj);
  });

  // Update open_task_count on members
  members.forEach((m) => {
    const list = tasks[m.id] || [];
    m.open_task_count = list.filter((t) => ['open', 'in_progress', 'waiting'].includes(t.status)).length;
    m.active_journey_count = (careJourneys[m.id] || []).filter((j) => j.status === 'active').length;
  });

  const notes = {};
  members.slice(0, 5).forEach((m, idx) => {
    notes[m.id] = [{
      id: 200 + idx,
      member_id: m.id,
      author_email: 'admin@admin.com',
      author_name: 'Care Coordinator',
      channel: 'Phone',
      note_type: 'Outreach',
      body: `Spoke with ${m.first_name}. Reviewed care plan and confirmed next steps.`,
      related_task_id: null,
      related_journey_id: null,
      created_at: isoDaysFromNow(-1 - idx),
    }];
  });

  const messages = {};
  members.slice(0, 5).forEach((m, idx) => {
    messages[m.id] = [
      { id: 300 + idx * 2, member_id: m.id, channel: m.preferred_channel || 'SMS', direction: 'outbound', sender: 'ProminenceCare', recipient: m.phone || m.email || m.member_key, body: `Hi ${m.first_name}, this is your care team. Let us know a good time to talk this week.`, status: 'delivered', timestamp: isoDaysFromNow(-2 - idx) },
      { id: 301 + idx * 2, member_id: m.id, channel: m.preferred_channel || 'SMS', direction: 'inbound', sender: m.member_key, recipient: 'ProminenceCare', body: 'Thanks - tomorrow afternoon works.', status: 'received', timestamp: isoDaysFromNow(-1 - idx) },
    ];
  });

  const claims = {};
  members.forEach((m, idx) => {
    claims[m.id] = [
      { id: 400 + idx * 2, claim_number: `CLM-${m.member_key}-A`, service_date: dateOnly(isoDaysFromNow(-30 - idx)), provider: idx % 2 === 0 ? 'Mountain View Imaging' : 'Desert Cardiology', category: idx % 2 === 0 ? 'Imaging' : 'Cardiology', status: 'paid', billed_amount: 1280 + idx * 110, paid_amount: 720 + idx * 65, member_responsibility: 180 + idx * 15 },
      { id: 401 + idx * 2, claim_number: `CLM-${m.member_key}-B`, service_date: dateOnly(isoDaysFromNow(-14 - idx)), provider: 'Primary Care Group', category: 'Office Visit', status: 'processed', billed_amount: 240, paid_amount: 180, member_responsibility: 60 },
    ];
  });

  const accumulators = {};
  members.forEach((m, idx) => {
    accumulators[m.id] = {
      deductible: 2500,
      deductible_met: 420 + idx * 75,
      out_of_pocket_max: 7500,
      out_of_pocket_met: 1100 + idx * 130,
      plan_year_start: `${today.getFullYear()}-01-01`,
    };
  });

  const careOptionsSeed = [
    { member_id: 2, service_type: 'MRI - Shoulder', provider: 'Pacific Imaging Center', facility: 'Pacific Imaging Center', cost: 640, quality: 4.7, distance: 5.2, network: 'In Network', savings: 620, rationale: 'Same MRI protocol with equivalent radiology read at 49% lower cost.', member_facing: 'We found a high-quality imaging center 5 miles away that costs $620 less than your original facility.' },
    { member_id: 7, service_type: 'MRI - Knee', provider: 'ValleyOrtho Imaging', facility: 'ValleyOrtho Imaging', cost: 580, quality: 4.6, distance: 3.1, network: 'In Network', savings: 480, rationale: 'Lower-cost imaging facility with comparable quality and shorter wait time.', member_facing: 'ValleyOrtho can see you sooner and saves about $480 vs the originally ordered facility.' },
    { member_id: 3, service_type: 'Endocrinologist Consult', provider: 'Bay Endocrine Associates', facility: 'Bay Endocrine Associates', cost: 220, quality: 4.8, distance: 6.5, network: 'In Network', savings: 95, rationale: 'Highest-rated endocrinologist accepting new patients within 4 weeks.', member_facing: 'We found an endocrinologist with great reviews who is available soon.' },
  ];
  const careOptions = {};
  const savings = {};
  careOptionsSeed.forEach((spec, idx) => {
    const id = 500 + idx;
    if (!careOptions[spec.member_id]) careOptions[spec.member_id] = [];
    if (!savings[spec.member_id]) savings[spec.member_id] = [];
    careOptions[spec.member_id].push({
      id, member_id: spec.member_id, service_type: spec.service_type,
      recommended_provider: spec.provider, facility_name: spec.facility,
      cost_estimate: spec.cost, quality_score: spec.quality,
      distance_miles: spec.distance, network_status: spec.network,
      potential_savings: spec.savings, rationale: spec.rationale,
      member_facing_explanation: spec.member_facing, status: 'recommended',
    });
    savings[spec.member_id].push({
      id: 600 + idx, member_id: spec.member_id, care_option_id: id,
      original_expected_cost: spec.cost + spec.savings,
      steered_option_cost: spec.cost,
      estimated_savings: spec.savings,
      claim_received: false, savings_validated: false, validation_status: 'pending',
    });
  });

  const documents = {};
  members.slice(0, 4).forEach((m, idx) => {
    documents[m.id] = [{ id: 700 + idx, member_id: m.id, file_name: `${m.member_key}_care_waiver.pdf`, document_type: 'Care Waiver', uploaded_by: 'admin@admin.com', uploaded_at: isoDaysFromNow(-3 - idx), status: 'active' }];
  });

  return { members, riskInsights, templates, careJourneys, tasks, notes, messages, claims, accumulators, careOptions, savings, documents, nextId: 1000 };
};

const getSampleStore = (tenant) => {
  const key = (tenant || 'default').toLowerCase();
  let store = sampleStores.get(key);
  if (!store) {
    store = buildSampleData();
    sampleStores.set(key, store);
    if (sampleStores.size > SAMPLE_LIMIT) {
      const first = sampleStores.keys().next().value;
      sampleStores.delete(first);
    }
  }
  return store;
};

const buildSampleDashboard = (store) => {
  const members = store.members;
  const allTasks = Object.values(store.tasks).flat();
  const allSavings = Object.values(store.savings).flat();
  const highRisk = members.filter((m) => m.risk_tier === 'High').length;
  const critical = members.filter((m) => m.risk_tier === 'Critical').length;
  const openTasks = allTasks.filter((t) => ['open', 'in_progress', 'waiting'].includes(t.status)).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueTasks = allTasks.filter((t) => {
    if (!['open', 'in_progress'].includes(t.status)) return false;
    if (!t.due_date) return false;
    return new Date(t.due_date) < today;
  }).length;
  const activeJourneys = Object.values(store.careJourneys).flat().filter((j) => j.status === 'active').length;
  const estimatedSavings = allSavings.reduce((sum, s) => sum + (s.estimated_savings || 0), 0);
  const validatedSavings = allSavings.filter((s) => s.savings_validated).reduce((sum, s) => sum + (s.estimated_savings || 0), 0);

  const highPriority = [...members]
    .filter((m) => ['High', 'Critical'].includes(m.risk_tier))
    .sort((a, b) => (b.risk_score_composite || 0) - (a.risk_score_composite || 0))
    .slice(0, 8);

  const driverMap = new Map();
  members.forEach((m) => {
    (store.riskInsights[m.id] || []).forEach((insight) => {
      const key = `${insight.domain}|${insight.driver}`;
      const entry = driverMap.get(key) || { domain: insight.domain, driver: insight.driver, member_count: 0, total_score: 0 };
      entry.member_count += 1;
      entry.total_score += insight.score || 0;
      driverMap.set(key, entry);
    });
  });
  const topDrivers = Array.from(driverMap.values())
    .map((d) => ({ domain: d.domain, driver: d.driver, member_count: d.member_count, average_score: d.member_count ? d.total_score / d.member_count : 0 }))
    .sort((a, b) => b.average_score - a.average_score)
    .slice(0, 5);

  const recentActivity = [];
  Object.values(store.notes).flat().forEach((n) => {
    const member = members.find((m) => m.id === n.member_id);
    recentActivity.push({ kind: 'note', member_id: n.member_id, member_name: member ? `${member.first_name} ${member.last_name}` : '', summary: `${n.channel} note: ${n.body.slice(0, 80)}`, timestamp: n.created_at });
  });
  Object.values(store.messages).flat().forEach((msg) => {
    const member = members.find((m) => m.id === msg.member_id);
    recentActivity.push({ kind: 'message', member_id: msg.member_id, member_name: member ? `${member.first_name} ${member.last_name}` : '', summary: `${msg.channel} ${msg.direction}: ${msg.body.slice(0, 80)}`, timestamp: msg.timestamp });
  });
  recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const upcomingActions = allTasks
    .filter((t) => ['open', 'in_progress'].includes(t.status))
    .sort((a, b) => new Date(a.due_date || 0) - new Date(b.due_date || 0))
    .slice(0, 8)
    .map((t) => {
      const member = members.find((m) => m.id === t.member_id);
      return { member_id: t.member_id, member_name: member ? `${member.first_name} ${member.last_name}` : '', risk_tier: member?.risk_tier || null, next_action: t.recommended_next_action || t.title, due_date: t.due_date };
    });

  return {
    metrics: [
      { key: 'total_members', label: 'Members in active workflows', value: members.length, hint: 'All Member360-tracked members' },
      { key: 'high_risk', label: 'High-risk members', value: highRisk, hint: 'Risk tier = High' },
      { key: 'critical_risk', label: 'Critical-risk members', value: critical, hint: 'Risk tier = Critical' },
      { key: 'open_tasks', label: 'Open tasks', value: openTasks, hint: 'Status open / in_progress / waiting' },
      { key: 'overdue_tasks', label: 'Overdue tasks', value: overdueTasks, hint: 'Past due date and still open' },
      { key: 'active_journeys', label: 'Active care journeys', value: activeJourneys, hint: 'Status = active' },
      { key: 'estimated_savings', label: 'Estimated savings', value: estimatedSavings, hint: 'All steerage opportunities' },
      { key: 'validated_savings', label: 'Validated savings', value: validatedSavings, hint: 'Confirmed via claim' },
    ],
    high_priority_members: highPriority,
    top_risk_drivers: topDrivers,
    recent_activity: recentActivity.slice(0, 8),
    upcoming_actions: upcomingActions,
    __sample: true,
  };
};

const filterSampleMembers = (members, { search, risk_tier, has_active_journey, has_open_task }) => {
  let results = members;
  if (search) {
    const term = search.toLowerCase();
    results = results.filter((m) => {
      const hay = [m.first_name, m.last_name, m.member_key, m.primary_care_provider, m.plan_name].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    });
  }
  if (risk_tier && risk_tier.length) {
    const set = new Set(risk_tier);
    results = results.filter((m) => set.has(m.risk_tier));
  }
  if (has_active_journey === true) results = results.filter((m) => (m.active_journey_count || 0) > 0);
  else if (has_active_journey === false) results = results.filter((m) => (m.active_journey_count || 0) === 0);
  if (has_open_task === true) results = results.filter((m) => (m.open_task_count || 0) > 0);
  else if (has_open_task === false) results = results.filter((m) => (m.open_task_count || 0) === 0);
  return results;
};

const buildSampleMemberDetail = (store, memberId) => {
  const member = store.members.find((m) => m.id === Number(memberId));
  if (!member) return null;
  return {
    member: deepClone(member),
    risk_insights: deepClone(store.riskInsights[member.id] || []),
    tasks: deepClone(store.tasks[member.id] || []),
    care_journeys: deepClone(store.careJourneys[member.id] || []),
    notes: deepClone(store.notes[member.id] || []),
    messages: deepClone(store.messages[member.id] || []),
    claims: deepClone(store.claims[member.id] || []),
    accumulator: store.accumulators[member.id] ? deepClone(store.accumulators[member.id]) : null,
    care_options: deepClone(store.careOptions[member.id] || []),
    savings: deepClone(store.savings[member.id] || []),
    documents: deepClone(store.documents[member.id] || []),
    __sample: true,
  };
};

// ------------------- Public API -------------------

export const fetchMember360Dashboard = async (token, tenant) => {
  if (shouldUseSample(token)) return buildSampleDashboard(getSampleStore(tenant));
  const res = await fetch(`${API_BASE}/api/member360/dashboard`, { headers: buildHeaders(token, tenant) });
  return handleResponse(res);
};

export const fetchMember360Members = async (token, tenant, filters = {}) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const filtered = filterSampleMembers(store.members, filters);
    return { items: filtered.map(deepClone), total: filtered.length, __sample: true };
  }
  const query = toQuery({
    search: filters.search,
    risk_tier: filters.risk_tier,
    has_active_journey: filters.has_active_journey,
    has_open_task: filters.has_open_task,
    limit: filters.limit,
    offset: filters.offset,
  });
  const res = await fetch(`${API_BASE}/api/member360/members${query}`, { headers: buildHeaders(token, tenant) });
  return handleResponse(res);
};

export const fetchMember360MemberDetail = async (token, tenant, memberId) => {
  if (shouldUseSample(token)) {
    const detail = buildSampleMemberDetail(getSampleStore(tenant), memberId);
    if (!detail) throw new Error('Member not found');
    return detail;
  }
  const res = await fetch(`${API_BASE}/api/member360/members/${memberId}`, { headers: buildHeaders(token, tenant) });
  return handleResponse(res);
};

export const createMember360Task = async (token, tenant, payload) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const member = store.members.find((m) => m.id === payload.member_id);
    if (!member) throw new Error('Member not found');
    const id = store.nextId++;
    const task = {
      id, member_id: payload.member_id, journey_id: payload.journey_id || null,
      title: payload.title, description: payload.description || null,
      assigned_user: payload.assigned_user || 'admin@admin.com',
      assigned_queue: payload.assigned_queue || 'Care Coordination',
      priority: payload.priority || 'medium', status: payload.status || 'open',
      due_date: payload.due_date || dateOnly(isoDaysFromNow(3)),
      sbar: payload.sbar || { situation: null, background: null, assessment: null, recommendation: null },
      recommended_next_action: payload.recommended_next_action || null,
      auto_generated_reason: payload.auto_generated_reason || null,
      notes: payload.notes || null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      member_name: `${member.first_name} ${member.last_name}`, risk_tier: member.risk_tier,
    };
    if (!store.tasks[member.id]) store.tasks[member.id] = [];
    store.tasks[member.id].unshift(task);
    member.open_task_count = (member.open_task_count || 0) + 1;
    return deepClone(task);
  }
  const res = await fetch(`${API_BASE}/api/member360/tasks`, { method: 'POST', headers: buildHeaders(token, tenant), body: JSON.stringify(payload) });
  return handleResponse(res);
};

export const updateMember360Task = async (token, tenant, taskId, payload) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    for (const memberTasks of Object.values(store.tasks)) {
      const idx = memberTasks.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        memberTasks[idx] = { ...memberTasks[idx], ...payload, updated_at: new Date().toISOString() };
        return deepClone(memberTasks[idx]);
      }
    }
    throw new Error('Task not found');
  }
  const res = await fetch(`${API_BASE}/api/member360/tasks/${taskId}`, { method: 'PATCH', headers: buildHeaders(token, tenant), body: JSON.stringify(payload) });
  return handleResponse(res);
};

export const createMember360Note = async (token, tenant, memberId, payload) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const id = store.nextId++;
    const note = { id, member_id: memberId, author_email: 'admin@admin.com', author_name: 'Sandbox User', channel: payload.channel || 'internal', note_type: payload.note_type || null, body: payload.body, related_task_id: payload.related_task_id || null, related_journey_id: payload.related_journey_id || null, created_at: new Date().toISOString() };
    if (!store.notes[memberId]) store.notes[memberId] = [];
    store.notes[memberId].unshift(note);
    return deepClone(note);
  }
  const res = await fetch(`${API_BASE}/api/member360/members/${memberId}/notes`, { method: 'POST', headers: buildHeaders(token, tenant), body: JSON.stringify(payload) });
  return handleResponse(res);
};

export const createMember360Message = async (token, tenant, memberId, payload) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const member = store.members.find((m) => m.id === memberId);
    const id = store.nextId++;
    const msg = { id, member_id: memberId, channel: payload.channel || 'chat', direction: payload.direction || 'outbound', sender: payload.sender || 'admin@admin.com', recipient: payload.recipient || (member ? member.phone : null), body: payload.body, status: 'sent', timestamp: new Date().toISOString() };
    if (!store.messages[memberId]) store.messages[memberId] = [];
    store.messages[memberId].unshift(msg);
    return deepClone(msg);
  }
  const res = await fetch(`${API_BASE}/api/member360/members/${memberId}/messages`, { method: 'POST', headers: buildHeaders(token, tenant), body: JSON.stringify(payload) });
  return handleResponse(res);
};

export const createMember360CareOption = async (token, tenant, payload) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const id = store.nextId++;
    const opt = { id, member_id: payload.member_id, service_type: payload.service_type, recommended_provider: payload.recommended_provider || null, facility_name: payload.facility_name || null, cost_estimate: payload.cost_estimate || null, quality_score: payload.quality_score || null, distance_miles: payload.distance_miles || null, network_status: payload.network_status || null, potential_savings: payload.potential_savings || null, rationale: payload.rationale || null, member_facing_explanation: payload.member_facing_explanation || null, status: payload.status || 'recommended' };
    if (!store.careOptions[payload.member_id]) store.careOptions[payload.member_id] = [];
    store.careOptions[payload.member_id].unshift(opt);
    if (opt.potential_savings) {
      if (!store.savings[payload.member_id]) store.savings[payload.member_id] = [];
      store.savings[payload.member_id].unshift({
        id: store.nextId++, member_id: payload.member_id, care_option_id: id,
        original_expected_cost: (opt.cost_estimate || 0) + (opt.potential_savings || 0),
        steered_option_cost: opt.cost_estimate || 0,
        estimated_savings: opt.potential_savings, claim_received: false,
        savings_validated: false, validation_status: 'pending',
      });
    }
    return deepClone(opt);
  }
  const res = await fetch(`${API_BASE}/api/member360/care-options`, { method: 'POST', headers: buildHeaders(token, tenant), body: JSON.stringify(payload) });
  return handleResponse(res);
};

export const fetchMember360JourneyTemplates = async (token, tenant) => {
  if (shouldUseSample(token)) return deepClone(getSampleStore(tenant).templates);
  const res = await fetch(`${API_BASE}/api/member360/care-journey-templates`, { headers: buildHeaders(token, tenant) });
  return handleResponse(res);
};

// ------------------- Aggregate (multi-member) helpers -------------------
// Used by the lab index pages. In sample mode they read straight from the
// in-memory store. With a real backend they fan out across the members list
// and per-member detail endpoint — fine for a lab-scale tenant, deliberately
// not paginated because there is no aggregate endpoint server-side yet.

const memberLookup = (members) => {
  const map = new Map();
  members.forEach((m) => map.set(m.id, m));
  return map;
};

const attachMemberSummary = (row, member) => ({
  ...row,
  member_id: row.member_id ?? member?.id,
  member_name: member ? `${member.first_name || ''} ${member.last_name || ''}`.trim() : row.member_name,
  member_key: member?.member_key || null,
  risk_tier: member?.risk_tier || row.risk_tier || null,
  plan_name: member?.plan_name || null,
  preferred_channel: member?.preferred_channel || null,
});

const fanOutDetails = async (token, tenant) => {
  const { items: members } = await fetchMember360Members(token, tenant, { limit: 500 });
  const details = await Promise.all(
    members.map((m) =>
      fetchMember360MemberDetail(token, tenant, m.id).catch(() => null)
    )
  );
  return { members, details: details.filter(Boolean) };
};

export const fetchMember360AllTasks = async (token, tenant) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const lookup = memberLookup(store.members);
    const rows = Object.values(store.tasks).flat().map((t) => attachMemberSummary(t, lookup.get(t.member_id)));
    return deepClone(rows);
  }
  const { details } = await fanOutDetails(token, tenant);
  const rows = [];
  details.forEach((d) => {
    (d.tasks || []).forEach((t) => rows.push(attachMemberSummary(t, d.member)));
  });
  return rows;
};

export const fetchMember360AllMessages = async (token, tenant) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const lookup = memberLookup(store.members);
    const rows = Object.values(store.messages).flat().map((m) => attachMemberSummary(m, lookup.get(m.member_id)));
    return deepClone(rows);
  }
  const { details } = await fanOutDetails(token, tenant);
  const rows = [];
  details.forEach((d) => {
    (d.messages || []).forEach((m) => rows.push(attachMemberSummary(m, d.member)));
  });
  return rows;
};

export const fetchMember360AllCareOptions = async (token, tenant) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const lookup = memberLookup(store.members);
    const rows = Object.values(store.careOptions).flat().map((o) => attachMemberSummary(o, lookup.get(o.member_id)));
    return deepClone(rows);
  }
  const { details } = await fanOutDetails(token, tenant);
  const rows = [];
  details.forEach((d) => {
    (d.care_options || []).forEach((o) => rows.push(attachMemberSummary(o, d.member)));
  });
  return rows;
};

export const fetchMember360AllDocuments = async (token, tenant) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const lookup = memberLookup(store.members);
    const rows = Object.values(store.documents).flat().map((d) => attachMemberSummary(d, lookup.get(d.member_id)));
    return deepClone(rows);
  }
  const { details } = await fanOutDetails(token, tenant);
  const rows = [];
  details.forEach((d) => {
    (d.documents || []).forEach((doc) => rows.push(attachMemberSummary(doc, d.member)));
  });
  return rows;
};

export const fetchMember360AllJourneys = async (token, tenant) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const lookup = memberLookup(store.members);
    const rows = Object.values(store.careJourneys).flat().map((j) => attachMemberSummary(j, lookup.get(j.member_id)));
    return deepClone(rows);
  }
  const { details } = await fanOutDetails(token, tenant);
  const rows = [];
  details.forEach((d) => {
    (d.care_journeys || []).forEach((j) => rows.push(attachMemberSummary(j, d.member)));
  });
  return rows;
};

export const fetchMember360AllRiskInsights = async (token, tenant) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const lookup = memberLookup(store.members);
    const rows = [];
    Object.entries(store.riskInsights).forEach(([memberId, insights]) => {
      const member = lookup.get(Number(memberId));
      insights.forEach((insight) => rows.push(attachMemberSummary(insight, member)));
    });
    return deepClone(rows);
  }
  const { details } = await fanOutDetails(token, tenant);
  const rows = [];
  details.forEach((d) => {
    (d.risk_insights || []).forEach((i) => rows.push(attachMemberSummary(i, d.member)));
  });
  return rows;
};
