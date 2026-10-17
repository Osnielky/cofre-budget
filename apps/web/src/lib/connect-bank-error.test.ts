import { describe, it, expect } from 'vitest';
import { connectBankError } from './connect-bank-error';

describe('connectBankError', () => {
  it('asks a free user to upgrade instead of blaming Plaid', () => {
    expect(connectBankError(403, { code: 'PLAN_UPGRADE_REQUIRED' })).toEqual({
      upgrade: true,
      message: 'Automatic bank sync is a Pro feature. Upgrade to connect your bank — your accounts and imported transactions stay as they are.',
    });
  });

  it('passes through the institution-limit message', () => {
    expect(connectBankError(403, { code: 'INSTITUTION_LIMIT_REACHED', message: 'Pro is limited to 4 linked institutions — upgrade to Elite for unlimited.' }))
      .toEqual({ upgrade: true, message: 'Pro is limited to 4 linked institutions — upgrade to Elite for unlimited.' });
  });

  it('reports anything else as a connection problem, not a credentials problem', () => {
    const r = connectBankError(500, null);
    expect(r.upgrade).toBe(false);
    expect(r.message).not.toMatch(/credentials/i);
  });
});
