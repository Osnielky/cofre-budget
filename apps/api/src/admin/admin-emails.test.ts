import { describe, it, expect } from 'vitest';
import { isAdminEmail } from './admin-emails';

describe('isAdminEmail', () => {
  it('matches a listed email', () => {
    expect(isAdminEmail('info@osmioservices.com', 'info@osmioservices.com')).toBe(true);
  });
  it('ignores case and surrounding whitespace on both sides', () => {
    expect(isAdminEmail('  INFO@osmioservices.com ', ' a@x.com , Info@OsmioServices.com ,')).toBe(true);
  });
  it('rejects an email that is not listed', () => {
    expect(isAdminEmail('someone@else.com', 'a@x.com,b@y.com')).toBe(false);
  });
  it('treats an unset or empty list as no admins', () => {
    expect(isAdminEmail('a@x.com', undefined)).toBe(false);
    expect(isAdminEmail('a@x.com', '')).toBe(false);
    expect(isAdminEmail('a@x.com', ' , ,')).toBe(false);
  });
  it('rejects a missing email even if the list has an empty entry', () => {
    expect(isAdminEmail('', 'a@x.com,,')).toBe(false);
    expect(isAdminEmail(undefined, 'a@x.com')).toBe(false);
  });
  it('does not match on a substring', () => {
    expect(isAdminEmail('a@x.co', 'a@x.com')).toBe(false);
  });
});
