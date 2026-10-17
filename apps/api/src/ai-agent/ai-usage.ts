/** Ask Cofre messages a user may send per UTC day, by plan. */
const DAILY_MESSAGE_LIMITS: Record<string, number> = { pro: 25, elite: 50 };

export function dailyMessageLimit(plan: string): number {
  return DAILY_MESSAGE_LIMITS[plan] ?? 0;
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface MessageUsage {
  limit: number;
  used: number;
  remaining: number;
  /** ISO time the count resets (next UTC midnight). */
  resetsAt: string;
}

export function messageUsage(plan: string, used: number, now: Date = new Date()): MessageUsage {
  const limit = dailyMessageLimit(plan);
  const resetsAt = new Date(startOfUtcDay(now).getTime() + 24 * 60 * 60 * 1000).toISOString();
  return { limit, used, remaining: Math.max(0, limit - used), resetsAt };
}
