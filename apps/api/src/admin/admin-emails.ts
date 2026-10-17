/**
 * Whether `email` is in the ADMIN_EMAILS allowlist (comma-separated, case- and
 * whitespace-insensitive). An unset or empty list means nobody is an admin.
 */
export function isAdminEmail(email: string | null | undefined, raw: string | null | undefined): boolean {
  const target = (email ?? '').trim().toLowerCase();
  if (!target || !raw) return false;
  return raw.split(',').some((e) => e.trim().toLowerCase() === target);
}
