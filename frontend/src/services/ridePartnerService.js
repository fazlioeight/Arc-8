const STORAGE_KEY = 'rideSharePartners';

const DEFAULT_PARTNERS = [
  {
    id: 'partner-transitease',
    companyName: 'TransitEase Co-op',
    contactName: 'Riley Carter',
    contactEmail: 'ops@transitease.example.com',
    createdAt: '2024-09-20T15:00:00.000Z',
    schedules: [
      {
        id: 'schedule-transitease-weekly',
        frequency: 'weekly',
        startDate: '2024-09-20',
        endDate: '2024-12-31',
        openSlots: 10,
        daysOfWeek: ['mon', 'wed', 'fri'],
        notes: 'Midday hospital loops'
      }
    ]
  },
  {
    id: 'partner-cityline',
    companyName: 'CityLine Mobility',
    contactName: 'Alex Morgan',
    contactEmail: 'service@cityline.example.com',
    createdAt: '2024-09-24T11:30:00.000Z',
    schedules: [
      {
        id: 'schedule-cityline-monthly',
        frequency: 'monthly',
        startDate: '2024-09-24',
        endDate: '2024-12-24',
        openSlots: 6,
        daysOfMonth: [1, 15, 28],
        notes: 'Recurring dialysis runs'
      }
    ]
  }
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

const toCloned = (value) => JSON.parse(JSON.stringify(value));

const startOfDay = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const readPartners = () => {
  if (!hasBrowserStorage()) {
    return toCloned(DEFAULT_PARTNERS);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PARTNERS));
      return toCloned(DEFAULT_PARTNERS);
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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

export const getAvailablePartnersForDate = (date = new Date()) => {
  const target = startOfDay(date);
  const partners = readPartners();
  return partners
    .map((partner) => {
      const activeSchedules = (partner.schedules || []).filter((schedule) => matchesFrequency(schedule, target));
      return activeSchedules.length > 0
        ? {
            id: partner.id,
            companyName: partner.companyName,
            schedules: activeSchedules,
          }
        : null;
    })
    .filter(Boolean);
};

export const clearPartners = () => {
  if (!hasBrowserStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
};

