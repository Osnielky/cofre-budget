import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, NAV_ITEMS, activePhoneTab, isNavActive, pageTitleFor, phoneMoreItems, phoneTabs } from './nav';

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

describe('phone navigation', () => {
  it('puts the four daily pages in the tab bar and the rest, in sidebar order, under More', () => {
    expect(phoneTabs().map((t) => t.label)).toEqual(['Dashboard', 'Transactions', 'Budgets', 'Ask Cofre']);
    expect(phoneMoreItems().map((t) => t.label)).toEqual(['Reports', 'Goals', 'Cards', 'Debts', 'Projects']);
    expect([...phoneTabs(), ...phoneMoreItems()]).toHaveLength(NAV_ITEMS.length);
  });

  it('lights the tab of the open page, More for the other pages, nothing off the map', () => {
    expect(activePhoneTab('/budgets')).toBe('/budgets');
    expect(activePhoneTab('/ask-cofre')).toBe('/ask-cofre');
    expect(activePhoneTab('/goals')).toBe('more');
    expect(activePhoneTab('/settings/plaid-oauth-redirect')).toBe('more');
    expect(activePhoneTab('/admin')).toBe('more');
    expect(activePhoneTab('/login')).toBeNull();
    expect(activePhoneTab(null)).toBeNull();
  });

  it('titles the top bar with the page name, Settings on its sub-routes, the app name elsewhere', () => {
    expect(pageTitleFor('/transactions')).toBe('Transactions');
    expect(pageTitleFor('/ask-cofre')).toBe('Ask Cofre');
    expect(pageTitleFor('/settings/plaid-oauth-redirect')).toBe('Settings');
    expect(pageTitleFor('/admin')).toBe('Admin');
    expect(pageTitleFor('/nowhere')).toBe('Cofre');
    expect(pageTitleFor(null)).toBe('Cofre');
  });
});
