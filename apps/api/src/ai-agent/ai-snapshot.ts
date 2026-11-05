/**
 * The per-turn financial snapshot Ask Cofre prepends to the user's message.
 *
 * Pure: the read-tools service gathers the numbers, this file only words them.
 * It goes in the user turn (after the cached system prompt + tools prefix) so the
 * model knows today's date, the accounts, the goal, the month's totals and the
 * category names before it answers — most questions then need zero or one tool
 * call instead of two or three round trips.
 */

export interface SnapshotAccount { name: string; type: string; balance: number }
export interface SnapshotNetWorth { current: number; target: number; projectedDate: string | null }
export interface SnapshotMonth { key: string; income: number; spending: number; budgeted: number; budgetSpent: number }
export interface SnapshotCategory { name: string; type: string }

export interface SnapshotInput {
  today: Date;
  /** YYYY-MM the UI's month picker is on, or null when it sent none. */
  focusMonth: string | null;
  accounts: SnapshotAccount[];
  netWorth: SnapshotNetWorth | null;
  /** Totals for the focused month, or null when nothing could be computed. */
  month: SnapshotMonth | null;
  categories: SnapshotCategory[];
}

/** Account types whose balance is money owed, not money held. */
const OWED_TYPES = new Set(['credit', 'loan', 'mortgage', 'other_liability']);

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function dateKeyOf(d: Date): string {
  return `${monthKeyOf(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function buildSnapshot(input: SnapshotInput): string {
  const { today, focusMonth, accounts, netWorth, month, categories } = input;
  const current = monthKeyOf(today);
  const focus = focusMonth ?? current;
  const lines: string[] = [];

  lines.push(`Today: ${dateKeyOf(today)}. The user is looking at ${focus}${focus === current ? ' (the current month)' : ''}.`);

  lines.push(accounts.length
    ? `Accounts: ${accounts.map((a) => `${a.name} (${a.type}) ${money(a.balance)}${OWED_TYPES.has(a.type) ? ' owed' : ''}`).join('; ')}`
    : 'Accounts: none connected yet');

  if (netWorth) {
    const projection = netWorth.projectedDate ? `projected to reach it ${netWorth.projectedDate}` : 'no projection yet';
    lines.push(`Net worth: ${money(netWorth.current)} of the ${whole(netWorth.target)} goal · ${projection}`);
  }

  if (month) {
    lines.push(`${month.key} so far: income ${money(month.income)} · spending ${money(month.spending)} · budgets ${money(month.budgeted)} planned, ${money(month.budgetSpent)} spent`);
  }

  if (categories.length) {
    lines.push(`Categories: ${categories.map((c) => (c.type === 'expense' ? c.name : `${c.name} [${c.type}]`)).join(', ')}`);
  }

  return lines.join('\n');
}

export interface HistoryMessage { role: 'user' | 'assistant'; content: string }

/**
 * The messages sent for one turn: the stored history (already holding the user's new
 * message as its last row) windowed to `max` earlier messages, then that last message
 * again with the snapshot in front of it. Snapshots are never stored, so each turn
 * carries exactly one — the fresh one.
 */
export function composeTurn<T extends HistoryMessage>(stored: T[], snapshot: string, max: number): HistoryMessage[] {
  const latest = stored[stored.length - 1];
  const earlier = windowHistory(stored.slice(0, -1), max);
  return [...earlier, { role: 'user', content: `<snapshot>\n${snapshot}\n</snapshot>\n\n${latest.content}` }];
}

/** The newest `max` messages, trimmed so the window opens on a user turn. */
export function windowHistory<T extends HistoryMessage>(messages: T[], max: number): T[] {
  const kept = messages.length > max ? messages.slice(messages.length - max) : messages.slice();
  while (kept.length && kept[0].role !== 'user') kept.shift();
  return kept;
}
