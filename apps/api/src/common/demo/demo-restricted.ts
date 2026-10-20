import { DEMO_OWNER_EMAIL } from '../../demo/demo.service';

/** Visitor sandboxes and the public-password Rockefeller account share the same route blocks. */
export function isDemoRestricted(user: { isDemo?: boolean; email?: string } | null | undefined): boolean {
  if (!user) return false;
  return !!user.isDemo || user.email === DEMO_OWNER_EMAIL;
}
