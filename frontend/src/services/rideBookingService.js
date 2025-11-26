import { getAvailablePartnersForDate } from './ridePartnerService';

const STORAGE_KEY = 'rideBookingHistory';

const DEFAULT_RIDES = [
  {
    id: 'ride-1001',
    memberId: 'M-1001',
    firstName: 'Jordan',
    lastName: 'Lee',
    rideType: 'Uber Health',
    pickup: 'Central Clinic',
    pickupAddress: '123 Clinic Way, Austin, TX',
    dropoff: 'Downtown Pharmacy',
    dropoffAddress: '45 Main St, Austin, TX',
    scheduledPickup: '2024-09-20T16:00:00.000Z',
    estimatedDropoff: '2024-09-20T16:45:00.000Z',
    costUsd: 28.5,
    status: 'completed'
  },
  {
    id: 'ride-1002',
    memberId: 'M-1042',
    firstName: 'Avery',
    lastName: 'Garcia',
    rideType: 'Lyft Assist',
    pickup: 'Northside Medical',
    pickupAddress: '9800 Northside Blvd, Austin, TX',
    dropoff: 'Greenview Labs',
    dropoffAddress: '220 Lab Plaza, Austin, TX',
    scheduledPickup: '2024-09-27T14:30:00.000Z',
    estimatedDropoff: '2024-09-27T15:20:00.000Z',
    costUsd: 34.75,
    status: 'completed'
  },
  {
    id: 'ride-1003',
    memberId: 'M-1120',
    firstName: 'Morgan',
    lastName: 'Patel',
    rideType: 'Uber Health',
    pickup: 'Westside Dialysis',
    pickupAddress: '47 Dialysis Park, Austin, TX',
    dropoff: 'Home',
    dropoffAddress: '6208 Spring Creek Rd, Austin, TX',
    scheduledPickup: '2024-09-29T09:15:00.000Z',
    estimatedDropoff: '2024-09-29T10:00:00.000Z',
    costUsd: 22.1,
    status: 'queued'
  }
];

const hasBrowserStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const computeStatus = (scheduledPickup, estimatedDropoff, explicitStatus) => {
  if (explicitStatus) {
    return explicitStatus;
  }
  const nowTs = Date.now();
  const pickupTs = scheduledPickup ? new Date(scheduledPickup).getTime() : Number.NaN;
  const dropoffTs = estimatedDropoff ? new Date(estimatedDropoff).getTime() : Number.NaN;

  if (!Number.isNaN(dropoffTs) && nowTs > dropoffTs) {
    return 'completed';
  }
  if (!Number.isNaN(pickupTs) && nowTs >= pickupTs) {
    return 'in_progress';
  }
  return 'queued';
};

const normalizeRideRecord = (ride) => {
  const pickupIso = ride.scheduledPickup || ride.createdAt || new Date().toISOString();
  const dropoffIso = ride.estimatedDropoff || new Date(new Date(pickupIso).getTime() + 45 * 60 * 1000).toISOString();
  return {
    id: ride.id || `ride-${Date.now()}`,
    memberId: ride.memberId || 'UNKNOWN',
    firstName: ride.firstName || 'Member',
    lastName: ride.lastName || 'Unknown',
    rideType: ride.rideType || 'Other',
    pickup: ride.pickup || 'Pickup Facility',
    pickupAddress: ride.pickupAddress || ride.pickup || 'Pickup address pending',
    dropoff: ride.dropoff || 'Dropoff Facility',
    dropoffAddress: ride.dropoffAddress || ride.dropoff || 'Dropoff address pending',
    scheduledPickup: pickupIso,
    estimatedDropoff: dropoffIso,
    createdAt: ride.createdAt || pickupIso,
    costUsd: typeof ride.costUsd === 'number' ? ride.costUsd : Number((20 + Math.random() * 15).toFixed(2)),
    status: computeStatus(pickupIso, dropoffIso, ride.status),
  };
};

const readHistory = () => {
  const seed = DEFAULT_RIDES.map(normalizeRideRecord);
  if (!hasBrowserStorage()) {
    return seed;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeRideRecord) : seed;
  } catch (error) {
    console.warn('Unable to read ride history:', error);
    return seed;
  }
};

const writeHistory = (history) => {
  if (!hasBrowserStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.warn('Unable to persist ride history:', error);
  }
};

export class RideBookingViewModel {
  constructor({
    id,
    memberId,
    firstName,
    lastName,
    rideType,
    pickup,
    pickupAddress,
    dropoff,
    dropoffAddress,
    pickupAt,
    dropoffAt,
    createdAt,
    costUsd,
    status,
  }) {
    this.id = id;
    this.memberId = memberId;
    this.firstName = firstName;
    this.lastName = lastName;
    this.memberName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Member';
    this.rideType = rideType;
    this.pickup = pickup;
    this.pickupAddress = pickupAddress;
    this.dropoff = dropoff;
    this.dropoffAddress = dropoffAddress;
    this.pickupAt = pickupAt || createdAt;
    this.dropoffAt = dropoffAt || null;
    this.createdAt = createdAt;
    this.costUsd = typeof costUsd === 'number' ? costUsd : null;
    this.status = status || 'queued';
    this.scheduledPickup = this.pickupAt;
    this.estimatedDropoff = this.dropoffAt;
  }

  static fromRecord(record) {
    if (!record) return null;
    const pickupAt = record.pickupAt || record.scheduledPickup || record.createdAt || new Date().toISOString();
    const dropoffAt = record.dropoffAt || record.estimatedDropoff || null;
    return new RideBookingViewModel({
      id: record.id,
      memberId: record.memberId,
      firstName: record.firstName,
      lastName: record.lastName,
      rideType: record.rideType,
      pickup: record.pickup,
      pickupAddress: record.pickupAddress,
      dropoff: record.dropoff,
      dropoffAddress: record.dropoffAddress,
      pickupAt,
      dropoffAt,
      createdAt: record.createdAt || pickupAt,
      costUsd: record.costUsd,
      status: record.status,
    });
  }
}

export const getRecentRides = (limit) => {
  const history = readHistory();
  const sorted = history
    .slice()
    .sort((a, b) => new Date(b.scheduledPickup).getTime() - new Date(a.scheduledPickup).getTime())
    .map((record) => RideBookingViewModel.fromRecord(record))
    .filter(Boolean);
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
};

export const addRideRecord = (ride) => {
  const history = readHistory();
  const record = normalizeRideRecord(ride);
  history.push(record);
  writeHistory(history);
  return RideBookingViewModel.fromRecord(record);
};

export const clearRideHistory = () => {
  if (!hasBrowserStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
};

export const BASE_RIDE_COMPANIES = ['Uber Health', 'Lyft Assist', 'Other'];

export const getRideCompaniesForDate = (date = new Date()) => {
  const partnerCompanies = getAvailablePartnersForDate(date).map((partner) => partner.companyName);
  const combined = [...BASE_RIDE_COMPANIES, ...partnerCompanies];
  return Array.from(new Set(combined));
};

export class RideBookingService {
  constructor({ token, tenant } = {}) {
    this.token = token;
    this.tenant = tenant;
  }

  getRideOptionsForDate(date = new Date()) {
    return getRideCompaniesForDate(date);
  }

  getRecentRides(limit) {
    return getRecentRides(limit);
  }

  bookRide(input) {
    return addRideRecord({ ...input, token: this.token, tenant: this.tenant });
  }

  clearHistory() {
    clearRideHistory();
  }
}
