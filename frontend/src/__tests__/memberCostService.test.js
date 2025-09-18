// Tests for memberCostService
import { getMemberCosts } from '../services/memberCostService';

describe('memberCostService.getMemberCosts', () => {
  const originalFetch = global.fetch;
  const token = 'test-token';
  const tenant = 'demo';

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('calls the correct endpoint and returns data', async () => {
    const mockJson = { member_id: '123', total_cost: 456.78 };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(mockJson) });

    const data = await getMemberCosts('123', token, tenant);

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/member/123/costs', {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Key': tenant,
      },
    });
    expect(data).toEqual(mockJson);
  });

  test('throws on unauthorized response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ detail: 'nope' }) });

    await expect(getMemberCosts('999', token, tenant)).rejects.toThrow('Unauthorized');
  });

  test('throws on non-OK response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ detail: 'err' }) });

    await expect(getMemberCosts('999', token, tenant)).rejects.toThrow('Failed to fetch member costs');
  });
});
