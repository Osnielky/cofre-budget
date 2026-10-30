import { describe, it, expect } from 'vitest';
import { followedAccountFor } from './followed';

const schwab = { id: 'schwab', bankName: 'Charles Schwab', accountName: 'Individual' };
const project = { accounts: [schwab] };

describe('followedAccountFor', () => {
  it('finds the followed account a row sits on', () => {
    expect(followedAccountFor(project, { bankAccountId: 'schwab' })).toBe(schwab);
  });
  it('finds it through the other side of a linked transfer', () => {
    expect(followedAccountFor(project, { bankAccountId: 'bofa', transferAccountId: 'schwab' })).toBe(schwab);
  });
  it('is null for an ordinary row, an unlinked transfer, or a project with no accounts', () => {
    expect(followedAccountFor(project, { bankAccountId: 'bofa', transferAccountId: null })).toBeNull();
    expect(followedAccountFor(project, { bankAccountId: 'bofa', transferAccountId: 'chase' })).toBeNull();
    expect(followedAccountFor({ accounts: [] }, { bankAccountId: 'schwab' })).toBeNull();
    expect(followedAccountFor({}, { bankAccountId: 'schwab' })).toBeNull();
  });
});
