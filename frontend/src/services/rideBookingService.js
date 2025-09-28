const STORAGE_KEY = 'rideBookingHistory';

const DEFAULT_RIDES = [
  {
    id: 'ride-1001',
    memberId: 'M-1001',
    firstName: 'Jordan',
    lastName: 'Lee',
    rideType: 'Uber',
    pickup: 'Central Clinic',
    dropoff: 'Downtown Pharmacy',
    createdAt: '2024-09-20T16:00:00.000Z'
  },
  {
    id: 'ride-1002',
    memberId: 'M-1042',
    firstName: 'Avery',
    lastName: 'Garcia',
    rideType: 'Lyft',
    pickup: 'Northside Medical',
    dropoff: 'Greenview Labs',
    createdAt: '2024-09-22T14:30:00.000Z'
  },
  {
    id: 'ride-1003',
    memberId: 'M-1120',
    firstName: 'Morgan',
    lastName: 'Patel',
    rideType: 'Uber',
    pickup: 'Westside Dialysis',
    dropoff: 'Home',
    createdAt: '2024-09-24T09:15:00.000Z'
  }
];

const hasBrowserStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const readHistory = () => {
  if (!hasBrowserStorage()) return [...DEFAULT_RIDES];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_RIDES));
      return [...DEFAULT_RIDES];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Unable to read ride history:', error);
    return [];
  }
};

const writeHistory = history => {
  if (!hasBrowserStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.warn('Unable to persist ride history:', error);
  }
};

export const getRecentRides = (limit) => {
  const history = readHistory();
  const sorted = history
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
};

export const addRideRecord = ride => {
  const history = readHistory();
  const record = {
    id: ride.id || `ride-${Date.now()}`,
    createdAt: ride.createdAt || new Date().toISOString(),
    ...ride,
  };
  history.push(record);
  writeHistory(history);
  return record;
};

export const clearRideHistory = () => {
  if (!hasBrowserStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
};
