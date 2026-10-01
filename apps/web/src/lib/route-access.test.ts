import { describe, it, expect } from 'vitest';
import { routeDecision } from './route-access';

describe('routeDecision', () => {
  it('shows the landing page to signed-out visitors, including ones with a stale cookie', () => {
    expect(routeDecision('/', false)).toBe('allow');
  });

  it('sends signed-in visitors from / and /login to the dashboard', () => {
    expect(routeDecision('/', true)).toBe('to-dashboard');
    expect(routeDecision('/login', true)).toBe('to-dashboard');
  });

  it('keeps marketing and legal pages public', () => {
    for (const p of ['/pricing', '/privacy', '/terms', '/signup', '/login', '/forgot-password', '/reset-password']) {
      expect(routeDecision(p, false)).toBe('allow');
    }
  });

  // No dot in the path, so the middleware matcher sees it. Crawlers have no
  // cookie; redirecting them to /login would strip the image from every shared link.
  it('lets crawlers fetch the generated link-preview image', () => {
    expect(routeDecision('/opengraph-image', false)).toBe('allow');
  });

  it('still requires a session for app pages', () => {
    for (const p of ['/dashboard', '/settings', '/transactions', '/ask-cofre']) {
      expect(routeDecision(p, false)).toBe('to-login');
      expect(routeDecision(p, true)).toBe('allow');
    }
  });

  it('does not treat a prefix of a public path as public', () => {
    expect(routeDecision('/pricing-admin', false)).toBe('to-login');
  });
});
