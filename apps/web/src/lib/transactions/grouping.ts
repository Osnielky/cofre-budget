/** How the Transactions list is split into top-level, collapsible groups.
    Within every group rows are still shown day by day. */
export type GroupBy = 'bank' | 'flow' | 'recurring';

export const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'flow', label: 'Income / Expenses' },
  { value: 'recurring', label: 'Recurring' },
];

export type GroupKind = 'bank' | 'income' | 'expense' | 'other' | 'recurring' | 'one-time';

export interface TxGroup<T> {
  id: string;        // stable collapse key, unique across group-by modes
  kind: GroupKind;
  label: string;
  hint: string;
  txs: T[];
}

interface GroupableTx {
  amount: number | string;
  bankAccountId: string | null;
  bankAccount: { bankName: string } | null;
}

export interface GroupingRules<T> {
  /** Transfers and savings moves: neither income nor spending. */
  isNonSpending: (t: T) => boolean;
  /** Matches the list's "Recurring" filter. */
  isRecurring: (t: T) => boolean;
}

/** Splits already-filtered, already-sorted rows into groups, keeping row order. */
export function groupTransactions<T extends GroupableTx>(txs: T[], by: GroupBy, rules: GroupingRules<T>): TxGroup<T>[] {
  if (by === 'bank') {
    const map = new Map<string, T[]>();
    for (const t of txs) {
      const key = t.bankAccountId ?? 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()]
      .map(([id, list]) => ({ id, kind: 'bank' as const, label: list[0]?.bankAccount?.bankName ?? 'Unknown bank', hint: '', txs: list }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  const buckets: TxGroup<T>[] = by === 'flow'
    ? [
        { id: 'flow:income', kind: 'income', label: 'Income', hint: 'Money coming in', txs: [] },
        { id: 'flow:expense', kind: 'expense', label: 'Expenses', hint: 'Money going out', txs: [] },
        { id: 'flow:other', kind: 'other', label: 'Transfers & savings', hint: 'Moves between your own accounts — not income or spending', txs: [] },
      ]
    : [
        { id: 'rec:recurring', kind: 'recurring', label: 'Recurring', hint: 'Charges that repeat month to month', txs: [] },
        { id: 'rec:one-time', kind: 'one-time', label: 'One-time', hint: 'Everything that doesn’t repeat', txs: [] },
      ];

  for (const t of txs) {
    let i: number;
    if (by === 'flow') i = rules.isNonSpending(t) ? 2 : Number(t.amount) >= 0 ? 0 : 1;
    else i = rules.isRecurring(t) ? 0 : 1;
    buckets[i].txs.push(t);
  }
  return buckets.filter((g) => g.txs.length > 0);
}
