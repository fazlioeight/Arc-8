import { RideBookingService } from '../services/rideBookingService';

describe('RideBookingService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('loads API rides and maps snake_case fields into the view model', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
        items: [
          {
            id: 'ride-1',
            member_id: 'M100',
            first_name: 'Avery',
            last_name: 'Stone',
            ride_type: 'Uber Health',
            pickup: 'Clinic',
            pickup_address: '1 Clinic Way',
            dropoff: 'Home',
            dropoff_address: '2 Home Ave',
            scheduled_pickup: '2026-04-25T15:30:00Z',
            estimated_dropoff: '2026-04-25T16:15:00Z',
            cost_usd: 22.5,
            status: 'queued',
          },
        ],
        total: 1,
      })),
    });

    const service = new RideBookingService({ token: 'real-token', tenant: 'prominencehealth' });
    const rides = await service.getRecentRides();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/ride-booking/rides',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Tenant-Key': 'prominencehealth' }),
      })
    );
    expect(rides[0].memberName).toBe('Avery Stone');
    expect(rides[0].pickupAddress).toBe('1 Clinic Way');
    expect(rides[0].costUsd).toBe(22.5);
  });
});
