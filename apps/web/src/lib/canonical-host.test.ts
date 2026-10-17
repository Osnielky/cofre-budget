import { describe, it, expect } from 'vitest';
import { canonicalRedirect } from './canonical-host';

describe('canonicalRedirect', () => {
  // Cookies are per host: a session made on www.budgetcofre.com is invisible on
  // budgetcofre.com (where the OAuth callbacks land), so everyone uses the apex.
  it('sends www to the bare domain, keeping path and query', () => {
    expect(canonicalRedirect('www.budgetcofre.com', '/settings', '?tab=billing')).toBe('https://budgetcofre.com/settings?tab=billing');
  });

  it('leaves the bare domain, run.app and localhost alone', () => {
    expect(canonicalRedirect('budgetcofre.com', '/', '')).toBeNull();
    expect(canonicalRedirect('cofre-web-4rcapvhcga-uc.a.run.app', '/', '')).toBeNull();
    expect(canonicalRedirect('localhost:3000', '/', '')).toBeNull();
    expect(canonicalRedirect(null, '/', '')).toBeNull();
  });
});
