import { describe, it, expect, vi } from 'vitest';
import { apiGet, ApiError, API } from './client';

const response = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('apiGet', () => {
  it('requests the path with credentials and returns the JSON body', async () => {
    const fetchImpl = vi.fn(async () => response(200, [{ id: 'a' }]));
    const rows = await apiGet<{ id: string }[]>('/bank-accounts', fetchImpl as unknown as typeof fetch);
    expect(rows).toEqual([{ id: 'a' }]);
    expect(fetchImpl).toHaveBeenCalledWith(`${API}/bank-accounts`, { credentials: 'include' });
  });

  it('throws an ApiError carrying the status, with the query string left out of the path', async () => {
    const fetchImpl = vi.fn(async () => response(401, { message: 'Unauthorized' }));
    await expect(apiGet('/transactions?from=2026-01-01', fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({ name: 'ApiError', status: 401, path: '/transactions' });
    await expect(apiGet('/x', fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(ApiError);
  });
});
