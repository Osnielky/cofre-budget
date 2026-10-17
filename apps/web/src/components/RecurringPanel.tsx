'use client';

export type RecurringUnit = 'day' | 'week' | 'month' | 'year';
export type EndMode = 'never' | 'on' | 'after';

export interface RecurringState {
  enabled: boolean;
  /** Set once the user edits Starts directly, so it stops following the
      transaction date. */
  startDateTouched?: boolean;
  interval: number;
  unit: RecurringUnit;
  dayOfMonth: number;
  startDate: string;
  endMode: EndMode;
  endDate: string;
  count: number;
  recordFirst: boolean;
}

export function emptyRecurring(startDate: string): RecurringState {
  const day = Number(startDate.slice(8, 10)) || 1;
  return {
    enabled: false, interval: 1, unit: 'month', dayOfMonth: day, startDateTouched: false,
    startDate, endMode: 'never', endDate: '', count: 12, recordFirst: true,
  };
}

/* ── Date maths, mirroring RecurringService on the API so the preview the user
      sees is the series the server will actually create. ── */

function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function daysInMonth(y: number, mi: number): number { return new Date(Date.UTC(y, mi + 1, 0)).getUTCDate(); }

export function occurrenceAt(r: Pick<RecurringState, 'startDate' | 'interval' | 'unit' | 'dayOfMonth'>, n: number): string {
  const start = parse(r.startDate);
  const step = Math.max(1, r.interval) * n;
  if (r.unit === 'day') return iso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + step)));
  if (r.unit === 'week') return iso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + step * 7)));
  const monthsPerStep = r.unit === 'year' ? 12 : 1;
  const t = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + step * monthsPerStep, 1));
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  const wanted = r.dayOfMonth || start.getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(wanted, daysInMonth(y, m)))));
}

/** Every date in the series. Endless rules preview a bounded window. */
export function occurrenceDates(r: RecurringState, cap = 120): string[] {
  if (!r.startDate) return [];
  const out: string[] = [];
  const max = r.endMode === 'after' ? Math.min(Math.max(r.count, 1), cap) : cap;
  for (let n = 0; n < cap; n++) {
    if (out.length >= max) break;
    const d = occurrenceAt(r, n);
    if (r.endMode === 'on' && r.endDate && d > r.endDate) break;
    out.push(d);
  }
  return out;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th', '13th', '14th', '15th',
  '16th', '17th', '18th', '19th', '20th', '21st', '22nd', '23rd', '24th', '25th', '26th', '27th', '28th', '29th', '30th', '31st'];

function fmtDay(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtFull(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function money(n: number) { return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`; }

interface Props {
  value: RecurringState;
  onChange: (next: RecurringState) => void;
  /** Absolute per-occurrence amount, for the series total. */
  amount: number;
  accent: string;
  /** Money out vs money in — only affects wording. */
  isExpense?: boolean;
}

export default function RecurringPanel({ value: r, onChange, amount, accent, isExpense = true }: Props) {
  const set = (patch: Partial<RecurringState>) => onChange({ ...r, ...patch });
  const dates = r.enabled ? occurrenceDates(r) : [];
  const endless = r.endMode === 'never';
  const monthly = r.unit === 'month' || r.unit === 'year';

  const field: React.CSSProperties = {
    background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)',
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
      {/* Toggle header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />
            <path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">Make it recurring</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Set when it repeats and when it stops.</p>
        </div>
        <button type="button" role="switch" aria-checked={r.enabled} aria-label="Make it recurring"
          onClick={() => set({ enabled: !r.enabled })}
          className="w-11 h-6 rounded-full shrink-0 transition-colors relative"
          style={{ background: r.enabled ? accent : 'var(--color-border)' }}>
          <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: r.enabled ? 22 : 2 }} />
        </button>
      </div>

      {r.enabled && (
        <div className="flex flex-col gap-3 px-4 pb-4 pt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
          {/* Every N units on the Xth */}
          <div className="flex items-center gap-2 flex-wrap pt-3">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Every</span>
            <div className="flex items-center rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
              <button type="button" aria-label="Decrease interval"
                onClick={() => set({ interval: Math.max(1, r.interval - 1) })}
                className="w-8 h-9 flex items-center justify-center hover:brightness-125"
                style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>−</button>
              <input type="number" min={1} max={99} value={r.interval} aria-label="Interval"
                onChange={(e) => set({ interval: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })}
                className="w-12 h-9 text-center text-sm font-semibold outline-none tabular-nums"
                style={{ background: 'var(--color-elevated)', color: 'var(--color-text-primary)' }} />
              <button type="button" aria-label="Increase interval"
                onClick={() => set({ interval: Math.min(99, r.interval + 1) })}
                className="w-8 h-9 flex items-center justify-center hover:brightness-125"
                style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>+</button>
            </div>
            <select value={r.unit} onChange={(e) => set({ unit: e.target.value as RecurringUnit })}
              aria-label="Repeat unit"
              className="h-9 px-2.5 rounded-xl text-sm outline-none" style={field}>
              <option value="day">{r.interval === 1 ? 'day' : 'days'}</option>
              <option value="week">{r.interval === 1 ? 'week' : 'weeks'}</option>
              <option value="month">{r.interval === 1 ? 'month' : 'months'}</option>
              <option value="year">{r.interval === 1 ? 'year' : 'years'}</option>
            </select>
            {monthly && (
              <>
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>on the</span>
                <select value={r.dayOfMonth} onChange={(e) => set({ dayOfMonth: Number(e.target.value) })}
                  aria-label="Day of month"
                  className="h-9 px-2.5 rounded-xl text-sm outline-none" style={field}>
                  {ORDINALS.map((o, i) => <option key={o} value={i + 1}>{o}</option>)}
                </select>
              </>
            )}
          </div>

          {/* Starts / Ends */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>Starts</p>
              <input type="date" value={r.startDate} aria-label="Start date"
                onChange={(e) => set({
                  startDate: e.target.value,
                  startDateTouched: true,
                  dayOfMonth: Number(e.target.value.slice(8, 10)) || r.dayOfMonth,
                })}
                className="w-full h-10 px-3 rounded-xl text-sm outline-none" style={field} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>Ends</p>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex rounded-xl p-0.5 shrink-0" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                  {([['never', 'Never'], ['on', 'On date'], ['after', 'After #']] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => set({ endMode: k })}
                      className="px-2.5 h-9 rounded-lg text-[11px] font-semibold transition-colors"
                      style={r.endMode === k
                        ? { background: `color-mix(in srgb, ${accent} 20%, transparent)`, color: accent }
                        : { color: 'var(--color-text-muted)' }}>
                      {label}
                    </button>
                  ))}
                </div>
                {r.endMode === 'on' && (
                  <input type="date" value={r.endDate} aria-label="End date"
                    onChange={(e) => set({ endDate: e.target.value })}
                    className="flex-1 min-w-0 h-10 px-3 rounded-xl text-sm outline-none" style={field} />
                )}
                {r.endMode === 'after' && (
                  <div className="flex items-center gap-1.5">
                    <input type="number" min={1} max={120} value={r.count} aria-label="Number of occurrences"
                      onChange={(e) => set({ count: Math.min(120, Math.max(1, Number(e.target.value) || 1)) })}
                      className="w-16 h-10 px-2 rounded-xl text-sm text-center outline-none tabular-nums" style={field} />
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>times</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Record the first occurrence now */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={r.recordFirst} onChange={(e) => set({ recordFirst: e.target.checked })}
              className="mt-0.5 w-4 h-4 shrink-0" style={{ accentColor: accent }} />
            <span className="min-w-0">
              <span className="block text-xs font-semibold">Record the first occurrence as {isExpense ? 'paid' : 'received'}</span>
              <span className="block text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {dates[0] ? `${fmtFull(dates[0])} · Future occurrences remain scheduled.` : 'Future occurrences remain scheduled.'}
              </span>
            </span>
          </label>

          {/* Series summary */}
          {dates.length > 0 && (
            <div className="rounded-xl p-3.5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-start gap-3 flex-wrap">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', color: 'var(--color-primary)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    Every {r.interval === 1 ? '' : `${r.interval} `}{r.unit}{r.interval === 1 ? '' : 's'}
                    {monthly ? <> on the {ORDINALS[r.dayOfMonth - 1]}</> : null}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {fmtFull(dates[0])}{endless ? ' onwards' : ` – ${fmtFull(dates[dates.length - 1])}`}
                  </p>
                </div>
                <div className="shrink-0 sm:pl-3" style={{ borderLeft: '1px solid var(--color-border)' }}>
                  <p className="text-xs font-bold sm:pl-3">
                    {endless ? 'Repeats indefinitely' : `${dates.length} occurrence${dates.length === 1 ? '' : 's'}`}
                  </p>
                  {!endless && amount > 0 && (
                    <p className="text-[11px] mt-0.5 sm:pl-3" style={{ color: 'var(--color-text-muted)' }}>
                      Series total <span className="font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{money(amount * dates.length)}</span>
                    </p>
                  )}
                </div>
              </div>

              {dates.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Next scheduled</span>
                  {dates.slice(1, 4).map((d) => (
                    <span key={d} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                      {fmtDay(d)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
