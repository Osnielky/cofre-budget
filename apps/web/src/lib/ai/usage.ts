/** Mirrors the API's MessageUsage (apps/api/src/ai-agent/ai-usage.ts). */
export interface MessageUsage {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
}

/** "5h 13m" / "18m" until `resetsAt`, rounded up, never below 1m. */
export function resetsIn(resetsAt: string, now: Date = new Date()): string {
  const mins = Math.max(1, Math.ceil((new Date(resetsAt).getTime() - now.getTime()) / 60_000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}
