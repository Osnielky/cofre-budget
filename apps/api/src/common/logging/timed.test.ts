import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { timed } from './timed';
import { setLogSink } from './log';

let lines: Array<Record<string, any>> = [];
beforeEach(() => { lines = []; setLogSink((l) => lines.push(JSON.parse(l))); });
afterEach(() => { setLogSink(null); delete process.env.SLOW_EXTERNAL_MS; });

describe('timed', () => {
  it('returns the result and logs duration at INFO', async () => {
    expect(await timed('plaid', 'transactionsSync', async () => 42)).toBe(42);
    expect(lines[0]).toMatchObject({ severity: 'INFO', external: { service: 'plaid', operation: 'transactionsSync', ok: true } });
    expect(typeof lines[0].external.durationMs).toBe('number');
  });

  it('flags a slow call at WARNING', async () => {
    process.env.SLOW_EXTERNAL_MS = '5';
    await timed('stripe', 'customers.create', () => new Promise((r) => setTimeout(r, 15)));
    expect(lines[0]).toMatchObject({ severity: 'WARNING', external: { slow: true, ok: true } });
  });

  it('takes a per-call threshold for calls that are slow by nature', async () => {
    process.env.SLOW_EXTERNAL_MS = '5';
    await timed('anthropic', 'chat', () => new Promise((r) => setTimeout(r, 15)), { slowMs: 1000 });
    expect(lines[0]).toMatchObject({ severity: 'INFO', external: { ok: true } });
  });

  it('logs a failure at ERROR and rethrows the same error', async () => {
    const err = Object.assign(new Error('Request failed with status code 400'), { response: { data: { error_code: 'ITEM_LOGIN_REQUIRED' } } });
    await expect(timed('plaid', 'accountsBalanceGet', async () => { throw err; })).rejects.toBe(err);
    expect(lines[0]).toMatchObject({
      severity: 'ERROR',
      external: { service: 'plaid', ok: false, error: 'Request failed with status code 400', errorCode: 'ITEM_LOGIN_REQUIRED' },
    });
  });
});
