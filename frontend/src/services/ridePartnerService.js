const STORAGE_KEY = 'rideSharePartners';
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const DEFAULT_PARTNERS = [
  {
    id: 'partner-transitease',
    companyName: 'TransitEase Co-op',
    contactName: 'Riley Carter',
    contactEmail: 'ops@transitease.example.com',
    createdAt: '2024-09-20T15:00:00.000Z',
    billingProfile: {
      payToName: 'TransitEase Co-op',
      paymentEmail: 'billing@transitease.example.com',
      paymentMethod: 'ach',
      remitAddress: 'TransitEase Co-op\nPO Box 1456\nAustin, TX 78767',
      taxId: '82-1456780',
      updatedAt: '2024-09-20T15:00:00.000Z',
    },
    schedules: [
      {
        id: 'schedule-transitease-weekly',
        frequency: 'weekly',
        startDate: '2024-09-20',
        endDate: '2024-12-31',
        openSlots: 10,
        daysOfWeek: ['mon', 'wed', 'fri'],
        notes: 'Midday hospital loops',
      },
    ],
  },
  {
    id: 'partner-cityline',
    companyName: 'CityLine Mobility',
    contactName: 'Alex Morgan',
    contactEmail: 'service@cityline.example.com',
    createdAt: '2024-09-24T11:30:00.000Z',
    billingProfile: {
      payToName: 'CityLine Mobility LLC',
      paymentEmail: 'ar@cityline.example.com',
      paymentMethod: 'virtual_card',
      remitAddress: 'CityLine Mobility\n88 Market Street\nDallas, TX 75201',
      taxId: '45-9981200',
      updatedAt: '2024-09-24T11:30:00.000Z',
    },
    schedules: [
      {
        id: 'schedule-cityline-monthly',
        frequency: 'monthly',
        startDate: '2024-09-24',
        endDate: '2024-12-24',
        openSlots: 6,
        daysOfMonth: [1, 15, 28],
        notes: 'Recurring dialysis runs',
      },
    ],
  },
];

const WEEKDAY_INDEX = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const hasBrowserStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const shouldUseApi = (token) => {
  if (!token) return false;
  return !String(token).toLowerCase().startsWith('sample');
};

const buildHeaders = (token, tenant) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
});

const handleResponse = async (response) => {
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    const detail = body?.detail || response.statusText || 'Request failed';
    throw new Error(detail);
  }
  return body;
};

const toCloned = (value) => JSON.parse(JSON.stringify(value));

const startOfDay = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const normalizeSchedule = (schedule = {}) => ({
  id: schedule.id,
  frequency: schedule.frequency,
  startDate: schedule.startDate || schedule.start_date,
  endDate: schedule.endDate || schedule.end_date,
  openSlots: schedule.openSlots ?? schedule.open_slots ?? 0,
  daysOfWeek: schedule.daysOfWeek || schedule.days_of_week || [],
  daysOfMonth: schedule.daysOfMonth || schedule.days_of_month || [],
  notes: schedule.notes || '',
});

const normalizeBillingProfile = (profile) => {
  if (!profile) return null;
  return {
    payToName: profile.payToName || profile.pay_to_name || '',
    paymentEmail: profile.paymentEmail || profile.payment_email || '',
    paymentMethod: profile.paymentMethod || profile.payment_method || 'ach',
    remitAddress: profile.remitAddress || profile.remit_address || '',
    taxId: profile.taxId || profile.tax_id || '',
    updatedAt: profile.updatedAt || profile.updated_at || null,
  };
};

const normalizePartner = (partner) => {
  const companyName = partner.companyName || partner.company_name || partner.name || '';
  const contactName = partner.contactName || partner.contact_name || '';
  const contactEmail = partner.contactEmail || partner.contact_email || partner.contact || '';
  return {
    ...partner,
    id: partner.id,
    name: companyName,
    contact: contactEmail || contactName,
    companyName,
    contactName,
    contactEmail,
    contactPhone: partner.contactPhone || partner.contact_phone || '',
    createdAt: partner.createdAt || partner.created_at || null,
    schedules: Array.isArray(partner.schedules) ? partner.schedules.map(normalizeSchedule) : [],
    billingProfile: normalizeBillingProfile(partner.billingProfile || partner.billing_profile),
  };
};

const readPartners = () => {
  if (!hasBrowserStorage()) {
    return toCloned(DEFAULT_PARTNERS).map(normalizePartner);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PARTNERS));
      return toCloned(DEFAULT_PARTNERS).map(normalizePartner);
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((partner) => normalizePartner(toCloned(partner)))
      : [];
  } catch (error) {
    console.warn('Unable to read ride share partners:', error);
    return [];
  }
};

const writePartners = (partners) => {
  if (!hasBrowserStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(partners));
  } catch (error) {
    console.warn('Unable to persist ride share partners:', error);
  }
};

const generateId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const matchesFrequency = (schedule, targetDate) => {
  if (!schedule || typeof schedule.openSlots !== 'number' || schedule.openSlots <= 0) return false;

  const start = startOfDay(schedule.startDate);
  const end = startOfDay(schedule.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (targetDate < start || targetDate > end) return false;

  const dayIndex = targetDate.getDay();
  const dayOfMonth = targetDate.getDate();

  switch (schedule.frequency) {
    case 'daily':
      return true;
    case 'weekly': {
      const allowed = Array.isArray(schedule.daysOfWeek) && schedule.daysOfWeek.length > 0
        ? schedule.daysOfWeek
        : Object.keys(WEEKDAY_INDEX);
      return allowed.some((code) => WEEKDAY_INDEX[code] === dayIndex);
    }
    case 'monthly': {
      const allowed = Array.isArray(schedule.daysOfMonth) && schedule.daysOfMonth.length > 0
        ? schedule.daysOfMonth
        : [dayOfMonth];
      return allowed.includes(dayOfMonth);
    }
    default:
      return false;
  }
};

export const getPartners = () => readPartners();

export const addPartner = ({ companyName, contactName, contactEmail }) => {
  if (!companyName || !companyName.trim()) {
    throw new Error('Company name is required');
  }
  const partners = readPartners();
  const newPartner = {
    id: generateId('partner'),
    companyName: companyName.trim(),
    contactName: contactName?.trim() || '',
    contactEmail: contactEmail?.trim() || '',
    createdAt: new Date().toISOString(),
    billingProfile: null,
    schedules: [],
  };
  partners.push(newPartner);
  writePartners(partners);
  return newPartner;
};

export const addPartnerSchedule = (partnerId, scheduleInput) => {
  const partners = readPartners();
  const index = partners.findIndex((partner) => partner.id === partnerId);
  if (index === -1) {
    throw new Error('Partner not found');
  }

  const schedule = {
    id: generateId('schedule'),
    frequency: scheduleInput.frequency,
    startDate: scheduleInput.startDate,
    endDate: scheduleInput.endDate,
    openSlots: Number.parseInt(scheduleInput.openSlots, 10) || 0,
    daysOfWeek: scheduleInput.daysOfWeek || [],
    daysOfMonth: scheduleInput.daysOfMonth || [],
    notes: scheduleInput.notes?.trim() || '',
  };

  partners[index].schedules = [...(partners[index].schedules || []), schedule];
  writePartners(partners);
  return schedule;
};

export const upsertPartnerBillingProfile = (partnerId, profileInput) => {
  const partners = readPartners();
  const index = partners.findIndex((partner) => partner.id === partnerId);
  if (index === -1) {
    throw new Error('Partner not found');
  }

  const profile = {
    payToName: profileInput.payToName?.trim() || '',
    paymentEmail: profileInput.paymentEmail?.trim() || '',
    paymentMethod: profileInput.paymentMethod || 'ach',
    remitAddress: profileInput.remitAddress?.trim() || '',
    taxId: profileInput.taxId?.trim() || '',
    updatedAt: new Date().toISOString(),
  };

  partners[index].billingProfile = profile;
  writePartners(partners);
  return profile;
};

export const getAvailablePartnersForDate = (date = new Date()) => {
  const target = startOfDay(date);
  const partners = readPartners();
  return partners
    .map((partner) => {
      const activeSchedules = (partner.schedules || []).filter((schedule) => matchesFrequency(schedule, target));
      return activeSchedules.length > 0
        ? {
            id: partner.id,
            name: partner.companyName,
            companyName: partner.companyName,
            contact: partner.contactEmail || partner.contactName || '',
            openSlots: activeSchedules.reduce((sum, schedule) => sum + (schedule.openSlots || 0), 0),
            schedules: activeSchedules,
          }
        : null;
    })
    .filter(Boolean);
};

const toApiPartnerPayload = ({ companyName, contactName, contactEmail, contactPhone }) => ({
  company_name: companyName,
  contact_name: contactName,
  contact_email: contactEmail,
  contact_phone: contactPhone,
});

const toApiSchedulePayload = (scheduleInput = {}) => ({
  frequency: scheduleInput.frequency,
  start_date: scheduleInput.startDate || scheduleInput.start_date,
  end_date: scheduleInput.endDate || scheduleInput.end_date,
  open_slots: Number.parseInt(scheduleInput.openSlots ?? scheduleInput.open_slots, 10) || 0,
  days_of_week: scheduleInput.daysOfWeek || scheduleInput.days_of_week || [],
  days_of_month: scheduleInput.daysOfMonth || scheduleInput.days_of_month || [],
  notes: scheduleInput.notes?.trim() || '',
});

const toApiBillingPayload = (profileInput = {}) => ({
  pay_to_name: profileInput.payToName ?? profileInput.pay_to_name ?? '',
  payment_email: profileInput.paymentEmail ?? profileInput.payment_email ?? '',
  payment_method: profileInput.paymentMethod ?? profileInput.payment_method ?? 'ach',
  remit_address: profileInput.remitAddress ?? profileInput.remit_address ?? '',
  tax_id: profileInput.taxId ?? profileInput.tax_id ?? '',
});

const dateParam = (date = new Date()) => {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return new Date().toISOString().slice(0, 10);
  return value.toISOString().slice(0, 10);
};

export const fetchPartners = async ({ token, tenant } = {}) => {
  if (!shouldUseApi(token)) {
    return getPartners();
  }
  const response = await fetch(`${API_BASE}/api/ride-booking/partners`, {
    headers: buildHeaders(token, tenant),
  });
  const data = await handleResponse(response);
  return (data?.items || []).map(normalizePartner);
};

export const createPartner = async ({ token, tenant, payload }) => {
  if (!shouldUseApi(token)) {
    return addPartner(payload);
  }
  const response = await fetch(`${API_BASE}/api/ride-booking/partners`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(toApiPartnerPayload(payload)),
  });
  return normalizePartner(await handleResponse(response));
};

export const createPartnerSchedule = async ({ token, tenant, partnerId, payload }) => {
  if (!shouldUseApi(token)) {
    return addPartnerSchedule(partnerId, payload);
  }
  const response = await fetch(`${API_BASE}/api/ride-booking/partners/${partnerId}/schedules`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(toApiSchedulePayload(payload)),
  });
  return normalizeSchedule(await handleResponse(response));
};

export const updatePartnerBillingProfile = async ({ token, tenant, partnerId, payload }) => {
  if (!shouldUseApi(token)) {
    return upsertPartnerBillingProfile(partnerId, payload);
  }
  const response = await fetch(`${API_BASE}/api/ride-booking/partners/${partnerId}/billing-profile`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(toApiBillingPayload(payload)),
  });
  return normalizeBillingProfile(await handleResponse(response));
};

export const fetchAvailablePartners = async ({ token, tenant, date = new Date() } = {}) => {
  if (!shouldUseApi(token)) {
    return getAvailablePartnersForDate(date);
  }
  const response = await fetch(`${API_BASE}/api/ride-booking/partners/available?date=${encodeURIComponent(dateParam(date))}`, {
    headers: buildHeaders(token, tenant),
  });
  const data = await handleResponse(response);
  return (data?.items || []).map((partner) => ({
    id: partner.id,
    name: partner.company_name,
    companyName: partner.company_name,
    contact: '',
    openSlots: partner.open_slots || 0,
    schedules: (partner.schedules || []).map(normalizeSchedule),
  }));
};

export const clearPartners = () => {
  if (!hasBrowserStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
};

