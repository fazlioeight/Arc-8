// Tests for memberCostService
import { getMemberCosts } from '../services/memberCostService';

describe('memberCostService.getMemberCosts', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('calls the correct endpoint and returns data', async () => {
    const mockJson = { member_id: '123', total_cost: 456.78 };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockJson) });

    const data = await getMemberCosts('123');

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/member/123/costs');
    expect(data).toEqual(mockJson);
  });

  test('throws on non-OK response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ detail: 'err' }) });

    await expect(getMemberCosts('999')).rejects.toThrow('Failed to fetch member costs');
  });
});

