/* The transactions list takes `limit` from the client. The web app asks for up
   to 20,000 rows (Reports, two years for the 12M preset), so that is the ceiling;
   anything above it is a mistake or abuse. Missing or malformed → the old
   default of 500. Pure, so the controller's edge is testable without Nest. */

export const DEFAULT_LIST_LIMIT = 500;
export const MAX_LIST_LIMIT = 20000;

export function clampListLimit(raw: string | undefined): number {
  const n = raw == null ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIST_LIMIT;
  return Math.min(n, MAX_LIST_LIMIT);
}
