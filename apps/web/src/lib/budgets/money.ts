/** All budget math runs on integer cents so sums and differences never pick up
    floating-point noise. Convert at the edges (API in, display out) only. */
export type Cents = number;

export function toCents(n: number | string | null | undefined): Cents {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}

export function fromCents(c: Cents): number {
  return c / 100;
}

/** 1234567 → "$12,345.67"; negatives get a leading minus ("-$114.63"). */
export function formatMoney(c: Cents, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(c);
  const body = (abs / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (c < 0) return `-$${body}`;
  return `${opts.sign && c > 0 ? '+' : ''}$${body}`;
}

/** Plain editable form, no symbol or grouping: 40000 → "400.00". */
export function formatPlain(c: Cents): string {
  return (c / 100).toFixed(2);
}

export type ParseResult = { ok: true; cents: Cents } | { ok: false; error: string };

const MAX_CENTS = 999_999_999_99; // decimal(12,2) ceiling

/** Parses what a person types into a currency field. Accepts "$1,234.5",
    "400", ".75"; rejects negatives, junk and more than two decimals rather
    than silently rounding them. */
export function parseMoneyInput(text: string): ParseResult {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, '').trim();
  if (t === '') return { ok: false, error: 'Enter an amount' };
  if (t.startsWith('-')) return { ok: false, error: 'Budget can’t be negative' };
  if (!/^\d*\.?\d*$/.test(t) || t === '.') return { ok: false, error: 'Enter a valid amount' };
  const [whole, frac = ''] = t.split('.');
  if (frac.length > 2) return { ok: false, error: 'Use at most 2 decimals' };
  const cents = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0') || '0');
  if (cents > MAX_CENTS) return { ok: false, error: 'Amount is too large' };
  return { ok: true, cents };
}

/** Percent change applied to a cent value, rounded half-away-from-zero to the cent. */
export function applyPercent(c: Cents, pct: number): Cents {
  return Math.max(0, Math.round((c * (100 + pct)) / 100));
}
