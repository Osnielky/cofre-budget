import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, NAV_ITEMS, isNavActive } from './nav';

describe('NAV_GROUPS', () => {
  it('groups the nine pages by job, in reading order', () => {
    expect(NAV_GROUPS.map((g) => [g.label, g.items.map((i) => i.label)])).toEqual([
      ['Overview', ['Dashboard', 'Ask Cofre']],
      ['Money', ['Transactions', 'Budgets', 'Reports']],
      ['Wealth', ['Goals', 'Cards', 'Debts', 'Projects']],
    ]);
  });

  it('lists every page once with a unique href and icon', () => {
    expect(NAV_ITEMS).toHaveLength(9);
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(9);
    expect(new Set(NAV_ITEMS.map((i) => i.icon)).size).toBe(9);
    for (const i of NAV_ITEMS) expect(i.href).toMatch(/^\/[a-z-]+$/);
  });
});

describe('isNavActive', () => {
  it('matches the page and its sub-routes, never a prefix of another page', () => {
    expect(isNavActive('/settings', '/settings')).toBe(true);
    expect(isNavActive('/settings/plaid-oauth-redirect', '/settings')).toBe(true);
    expect(isNavActive('/cards', '/c')).toBe(false);
    expect(isNavActive('/cardsx', '/cards')).toBe(false);
    expect(isNavActive('/transactions', '/dashboard')).toBe(false);
    expect(isNavActive(null, '/dashboard')).toBe(false);
  });
});
