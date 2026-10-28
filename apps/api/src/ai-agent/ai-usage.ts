/** Ask Cofre message allowance by plan. Pro and demo sandboxes reset every UTC
 *  day; Elite has one monthly pool (resets on the 1st, UTC) so a heavy day is
 *  fine but the month can never run past what the plan price covers. The
 *  'demo' plan is virtual: public demo sandboxes (User.isDemo) use it whatever
 *  plan the sandbox user carries, so strangers can't run up the Anthropic bill. */
export type UsagePeriod = 'day' | 'month';

interface MessageLimit {
  limit: number;
  period: UsagePeriod;
}

const MESSAGE_LIMITS: Record<string, MessageLimit> = {
  pro: { limit: 25, period: 'day' },
  elite: { limit: 400, period: 'month' },
  demo: { limit: 5, period: 'day' },
};

const NO_MESSAGES: MessageLimit = { limit: 0, period: 'day' };

export function messageLimit(plan: string, isDemo = false): MessageLimit {
  return MESSAGE_LIMITS[isDemo ? 'demo' : plan] ?? NO_MESSAGES;
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** When the plan's current allowance window began — count messages from here. */
export function usageWindowStart(plan: string, now: Date = new Date(), isDemo = false): Date {
  return messageLimit(plan, isDemo).period === 'month' ? startOfUtcMonth(now) : startOfUtcDay(now);
}

function windowEnd(period: UsagePeriod, now: Date): Date {
  if (period === 'month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return new Date(startOfUtcDay(now).getTime() + 24 * 60 * 60 * 1000);
}

export interface MessageUsage {
  limit: number;
  used: number;
  remaining: number;
  /** 'day' (Pro, demo) or 'month' (Elite) — the UI words "today" / "this month" from it. */
  period: UsagePeriod;
  /** ISO time the count resets (next UTC midnight, or the 1st of next month UTC). */
  resetsAt: string;
}

export function messageUsage(plan: string, used: number, now: Date = new Date(), isDemo = false): MessageUsage {
  const { limit, period } = messageLimit(plan, isDemo);
  return { limit, used, remaining: Math.max(0, limit - used), period, resetsAt: windowEnd(period, now).toISOString() };
}
