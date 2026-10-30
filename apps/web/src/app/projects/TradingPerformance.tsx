'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNarrowScreen } from '@/hooks/useNarrowScreen';
import { monthLabel, monthSeries, monthStats, monthWindow, shortMoney } from '@/lib/investments/monthly';

/* Performance section of a trading project linked to an investment account.
   Every number comes from GET /api/investments/performance (the API's FIFO
   engine, apps/api/src/investments/performance.ts); this file only renders.
   Spec: docs/superpowers/specs/2026-10-29-trading-performance-design.md */

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface ClosedTrade { date: string; symbol: string; account?: string; side: 'long' | 'short'; quantity: number; entry: number; exit: number; fees: number; pnl: number }
interface SymbolSummary { symbol: string; name: string | null; realized: number; closedTrades: number; wins: number; openQuantity: number; avgCost: number | null; costBasis: number }
interface OpenPosition { symbol: string; name: string | null; account?: string; side: 'long' | 'short'; quantity: number; avgCost: number; costBasis: number; since: string }
interface MonthSummary { month: string; realized: number; income: number; fees: number; closedTrades: number }
interface CashFlow { date: string; kind: 'contribution' | 'withdrawal'; amount: number; name: string; account?: string }
export interface Performance {
  rows: number; from: string | null; to: string | null;
  realizedPnl: number; fees: number; income: number; contributions: number; withdrawals: number; netContributed: number; netResult: number;
  trades: { total: number; closed: number; wins: number; losses: number; winRate: number | null; avgWin: number | null; avgLoss: number | null; profitFactor: number | null; largestWin: ClosedTrade | null; largestLoss: ClosedTrade | null };
  bySymbol: SymbolSummary[]; byMonth: MonthSummary[]; openPositions: OpenPosition[]; recentClosed: ClosedTrade[];
  cashFlows?: CashFlow[];
}
interface AccountRef { id: string; bankName: string; accountName: string; accountType: string }
export interface ProjectPerformance {
  project: { id: string; name: string };
  accounts: (Performance & { account: AccountRef })[];
  combined: Performance;
}

const money = (n: number, signed = false) => {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!signed || n === 0) return `$${abs}`;
  return n < 0 ? `-$${abs}` : `+$${abs}`;
};
const pnlColor = (n: number) => (n > 0 ? 'var(--color-green)' : n < 0 ? 'var(--color-rose)' : 'var(--color-text-secondary)');
const dateLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const qty = (n: number) => Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 4 });

const panel: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)',
  border: '1px solid color-mix(in srgb, var(--color-text-primary) 8%, transparent)',
  borderRadius: 'var(--radius-card)',
};

export default function TradingPerformance({ projectId, onEdit }: { projectId: string; onEdit?: () => void }) {
  const [data, setData] = useState<ProjectPerformance | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* 'all' = every linked account added together; otherwise one account's own result.
     With a single account there is nothing to add up, so that account is the view. */
  const [view, setView] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null); setView('all');
    fetch(`${API}/investments/performance?projectId=${encodeURIComponent(projectId)}`, { credentials: 'include' })
      .then(async (r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<ProjectPerformance>; })
      .then((d) => { if (!cancelled) { setData(d); setView(d.accounts.length === 1 ? d.accounts[0].account.id : 'all'); } })
      .catch(() => { if (!cancelled) setError('Could not load performance'); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (error) return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{error}.</p>;
  if (!data) return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading performance…</p>;

  const multi = data.accounts.length > 1;
  const current = view === 'all' ? data.combined : (data.accounts.find((a) => a.account.id === view) ?? data.combined);
  const t = current.trades;
  const noTrades = t.total === 0 && current.rows === 0;
  /* Short label per account: the bank, plus the account name when one bank has several. */
  const label = (a: AccountRef) => data.accounts.filter((x) => x.account.bankName === a.bankName).length > 1 ? `${a.bankName} · ${a.accountName}` : a.bankName;
  const scope = view === 'all'
    ? (multi ? `${data.accounts.length} accounts combined` : (data.accounts[0] ? `${data.accounts[0].account.bankName} · ${data.accounts[0].account.accountName}` : 'No accounts'))
    : (() => { const a = data.accounts.find((x) => x.account.id === view)?.account; return a ? `${a.bankName} · ${a.accountName}` : ''; })();
  const showAccountTag = view === 'all' && multi;
  const cashFlows = current.cashFlows ?? [];
  const lastCashOut = cashFlows.find((f) => f.kind === 'withdrawal') ?? null;

  return (
    <section className="flex flex-col gap-4" data-testid="trading-performance">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Performance</h3>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {scope}
            {current.from && current.to ? ` · ${dateLabel(current.from)} – ${dateLabel(current.to)}` : ''}
            {' · '}FIFO lots, realized only
          </p>
        </div>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{t.total} trade{t.total === 1 ? '' : 's'} · {t.closed} closed</span>
      </div>

      {/* Account switcher: the project total (when there is more than one account), then each account on its own */}
      <div className="flex items-center gap-2 flex-wrap">
        <div role="tablist" aria-label="Account" className="flex gap-1 p-1 rounded-xl max-w-full overflow-x-auto"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', scrollbarWidth: 'none' }}>
          {[...(multi ? [{ id: 'all', name: 'All accounts', pnl: data.combined.realizedPnl }] : []), ...data.accounts.map((a) => ({ id: a.account.id, name: label(a.account), pnl: a.realizedPnl }))].map((tab) => {
            const on = view === tab.id;
            return (
              <button key={tab.id} role="tab" aria-selected={on} onClick={() => setView(tab.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 whitespace-nowrap"
                style={on
                  ? { background: 'color-mix(in srgb, var(--color-primary) 22%, transparent)', color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)' }
                  : { color: 'var(--color-text-secondary)', border: '1px solid transparent' }}>
                {tab.name}
                <span className="tabular-nums" style={{ color: on ? 'inherit' : pnlColor(tab.pnl), opacity: on ? 0.8 : 1 }}>{money(tab.pnl, true)}</span>
              </button>
            );
          })}
        </div>
        {onEdit && (
          <button type="button" onClick={onEdit} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg hover:brightness-110"
            style={{ color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)' }}>
            + Add account
          </button>
        )}
      </div>

      {/* Trades without a symbol: rows synced before the trade columns existed. The next sync fills them in. */}
      {t.total > 0 && current.bySymbol.length === 0 && current.openPositions.length === 0 && (
        <p className="text-xs px-4 py-3" style={{ ...panel, color: 'var(--color-amber)', borderColor: 'color-mix(in srgb, var(--color-amber) 35%, transparent)' }}>
          These trades have no symbol or quantity yet, so they only count as cash. Press <strong>Sync</strong> on this bank in Settings → Bank Accounts and the next pull fills them in.
        </p>
      )}

      {noTrades ? (
        <p className="text-xs px-4 py-6 text-center" style={{ ...panel, color: 'var(--color-text-muted)' }}>
          No activity on this account yet. Sync the bank, or press "Re-download full history" in Settings → Bank Accounts to pull up to two years.
        </p>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Realized P&L', value: money(current.realizedPnl, true), clr: pnlColor(current.realizedPnl), sub: `${t.wins}W · ${t.losses}L` },
              { label: 'Win rate', value: t.winRate == null ? '—' : `${t.winRate}%`, clr: 'var(--color-text-primary)', sub: t.profitFactor == null ? (t.closed ? 'no losses yet' : 'no closed trades') : `profit factor ${t.profitFactor}` },
              { label: 'Dividends & interest', value: money(current.income, true), clr: pnlColor(current.income), sub: 'income' },
              { label: 'Fees', value: current.fees ? `-${money(current.fees)}` : '$0.00', clr: current.fees ? 'var(--color-rose)' : 'var(--color-text-secondary)', sub: 'account & management' },
              { label: 'Deposited', value: money(current.contributions), clr: 'var(--color-text-primary)', sub: `net in account ${money(current.netContributed, true)}` },
              { label: 'Cashed out', value: money(current.withdrawals), clr: current.withdrawals ? 'var(--color-card-sky)' : 'var(--color-text-secondary)', sub: lastCashOut ? `last ${dateLabel(lastCashOut.date)}` : 'nothing taken out yet' },
            ].map((k) => (
              <div key={k.label} className="p-3" style={panel}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{k.label}</p>
                <p className="font-bold text-base mt-1 truncate" style={{ color: k.clr }}>{k.value}</p>
                <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{k.sub}</p>
              </div>
            ))}
          </div>

          <div className="p-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px]" style={{ ...panel, color: 'var(--color-text-secondary)' }}>
            <span>Net result <strong style={{ color: pnlColor(current.netResult) }}>{money(current.netResult, true)}</strong></span>
            {t.avgWin != null && <span>Avg win <strong style={{ color: 'var(--color-green)' }}>{money(t.avgWin)}</strong></span>}
            {t.avgLoss != null && <span>Avg loss <strong style={{ color: 'var(--color-rose)' }}>{money(t.avgLoss)}</strong></span>}
            {t.largestWin && <span>Best <strong style={{ color: 'var(--color-green)' }}>{t.largestWin.symbol} {money(t.largestWin.pnl, true)}</strong>{showAccountTag && t.largestWin.account ? ` · ${t.largestWin.account}` : ''}</span>}
            {t.largestLoss && <span>Worst <strong style={{ color: 'var(--color-rose)' }}>{t.largestLoss.symbol} {money(t.largestLoss.pnl, true)}</strong>{showAccountTag && t.largestLoss.account ? ` · ${t.largestLoss.account}` : ''}</span>}
          </div>

          {/* Realized by month: continuous timeline, cumulative curve, summary figures */}
          {current.byMonth.length > 0 && <MonthlyPanel months={current.byMonth} />}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* By symbol */}
            <div className="p-3 sm:p-4 min-w-0" style={panel}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>By symbol</p>
              {current.bySymbol.length === 0 ? <Empty>No symbols yet.</Empty> : (
                <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {current.bySymbol.slice(0, 12).map((s) => (
                    <li key={s.symbol} className="flex items-center gap-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{s.symbol}</p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                          {s.closedTrades} closed · {s.wins}W{s.openQuantity ? ` · ${qty(s.openQuantity)} open` : ''}
                        </p>
                      </div>
                      <span className="font-bold tabular-nums shrink-0" style={{ color: pnlColor(s.realized) }}>{money(s.realized, true)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Open positions */}
            <div className="p-3 sm:p-4 min-w-0" style={panel}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>Open positions · cost basis</p>
              {current.openPositions.length === 0 ? <Empty>Nothing open — everything is closed out.</Empty> : (
                <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {current.openPositions.slice(0, 12).map((p) => (
                    <li key={p.symbol} className="flex items-center gap-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                          {p.symbol}{p.side === 'short' && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-amber) 16%, transparent)', color: 'var(--color-amber)' }}>SHORT</span>}
                        </p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{qty(p.quantity)} @ {money(p.avgCost)} · since {dateLabel(p.since)}{showAccountTag && p.account ? ` · ${p.account}` : ''}</p>
                      </div>
                      <span className="font-bold tabular-nums shrink-0" style={{ color: 'var(--color-text-primary)' }}>{money(p.costBasis)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>Current value needs live prices — coming with Plaid Holdings.</p>
            </div>
          </div>

          {/* Deposits & cash-outs: the owner's money moving in and out — never part of P&L */}
          {cashFlows.length > 0 && (
            <div className="p-3 sm:p-4 min-w-0" style={panel} data-testid="cash-flows">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Deposits & cash-outs</p>
                <p className="text-[10px] hidden sm:block" style={{ color: 'var(--color-text-muted)' }}>Your own money moving — not profit, not a cost</p>
              </div>
              <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {cashFlows.slice(0, 10).map((f, i) => {
                  const out = f.kind === 'withdrawal';
                  return (
                    <li key={`${f.date}-${i}`} className="flex items-center gap-3 py-2 text-xs">
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
                        style={{ background: `color-mix(in srgb, ${out ? 'var(--color-card-sky)' : 'var(--color-green)'} 16%, transparent)`, color: out ? 'var(--color-card-sky)' : 'var(--color-green)' }}>
                        {out ? '↑' : '↓'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{out ? 'Cashed out' : 'Deposited'}{showAccountTag && f.account ? ` · ${f.account}` : ''}</p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{dateLabel(f.date)}{f.name ? ` · ${f.name}` : ''}</p>
                      </div>
                      <span className="font-bold tabular-nums shrink-0" style={{ color: out ? 'var(--color-card-sky)' : 'var(--color-green)' }}>{out ? '-' : '+'}{money(f.amount)}</span>
                    </li>
                  );
                })}
              </ul>
              {cashFlows.length > 10 && <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>Showing the last 10 of {cashFlows.length}.</p>}
            </div>
          )}

          {/* Recent closed trades */}
          {current.recentClosed.length > 0 && (
            <div className="p-3 sm:p-4 min-w-0" style={panel}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>Recent closed trades</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: showAccountTag ? 520 : 420 }}>
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-left" style={{ color: 'var(--color-text-muted)' }}>
                      <th className="py-1 pr-2 font-semibold">Closed</th><th className="py-1 pr-2 font-semibold">Symbol</th>{showAccountTag && <th className="py-1 pr-2 font-semibold">Account</th>}<th className="py-1 pr-2 font-semibold">Side</th>
                      <th className="py-1 pr-2 font-semibold text-right">Qty</th><th className="py-1 pr-2 font-semibold text-right">Entry → Exit</th><th className="py-1 font-semibold text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.recentClosed.slice(0, 10).map((c, i) => (
                      <tr key={`${c.date}-${c.symbol}-${i}`} style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                        <td className="py-1.5 pr-2 whitespace-nowrap">{dateLabel(c.date)}</td>
                        <td className="py-1.5 pr-2 font-semibold" style={{ color: 'var(--color-text-primary)' }}>{c.symbol}</td>
                        {showAccountTag && <td className="py-1.5 pr-2 whitespace-nowrap">{c.account}</td>}
                        <td className="py-1.5 pr-2">{c.side}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{qty(c.quantity)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">{money(c.entry)} → {money(c.exit)}</td>
                        <td className="py-1.5 text-right font-bold tabular-nums" style={{ color: pnlColor(c.pnl) }}>{money(c.pnl, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs py-3" style={{ color: 'var(--color-text-muted)' }}>{children}</p>;
}

/* Month-by-month realized P&L. Bars are each month's result (green up, rose down,
   labelled), the line is the cumulative total since the first month of history, and
   the column beside it carries the figures a trader asks for first. Months the
   engine skipped are filled in so the timeline is continuous. */
function MonthlyPanel({ months }: { months: MonthSummary[] }) {
  const narrow = useNarrowScreen();
  const series = monthSeries(months);
  /* Phones draw six months; the figures always read the last twelve so they do not change with the screen. */
  const window = monthWindow(series, narrow ? 6 : 12);
  const stats = monthStats(monthWindow(series, 12), series);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  /* Geometry. Positive and negative regions share the plot height in proportion
     to the largest month on each side, so a losing month is not squeezed to a sliver. */
  const n = window.length;
  /* P is the plot; each side keeps TXT px for its value labels (above a green bar,
     below a red one) so labels never run into the axis text. */
  const P = 170, TXT = 14, AXIS = 30;
  const posMax = Math.max(0, ...window.map((m) => m.realized));
  const negMax = Math.max(0, ...window.map((m) => -m.realized));
  const span = posMax + negMax || 1;
  const posH = negMax === 0 ? P : posMax === 0 ? 0 : Math.max(40, Math.round((P * posMax) / span));
  const negH = P - posH;
  const y0 = posH;
  const slot = n ? width / n : 0;
  const barW = Math.max(6, Math.min(48, Math.round(slot * 0.56)));
  const showValues = slot >= 46;
  const cx = (i: number) => slot * i + slot / 2;
  const barH = (v: number) => (v >= 0 ? (posMax ? (v / posMax) * Math.max(0, posH - TXT) : 0) : (negMax ? (-v / negMax) * Math.max(0, negH - TXT) : 0));
  const cum = window.map((m) => m.cumulative);
  const cMin = Math.min(0, ...cum), cMax = Math.max(0, ...cum);
  /* The curve has its own scale (it is usually far larger than any single month) and stays inside the plot. */
  const cy = (v: number) => 10 + (cMax === cMin ? (P - 24) / 2 : ((cMax - v) / (cMax - cMin)) * (P - 24));
  const H = P + AXIS;
  const lastBarTop = n ? (window[n - 1].realized >= 0 ? y0 - barH(window[n - 1].realized) - 4 : y0 + barH(window[n - 1].realized) + 11) : 0;
  const showCumLabel = n > 1 && Math.abs(cy(cum[n - 1]) - lastBarTop) > 16;
  const line = cum.map((v, i) => `${i ? 'L' : 'M'} ${cx(i).toFixed(1)} ${cy(v).toFixed(1)}`).join(' ');
  const cumColor = 'var(--color-card-sky)';

  const figure = (label: string, value: string, sub: string, clr = 'var(--color-text-primary)') => (
    <div key={label} className="min-w-0">
      <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-sm font-bold tabular-nums truncate" style={{ color: clr }}>{value}</p>
      <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>
    </div>
  );

  return (
    <div className="p-3 sm:p-4" style={panel} data-testid="monthly-panel">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Realized P&L by month</p>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--color-green)' }} />month</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 rounded-full" style={{ height: 2, background: cumColor }} />cumulative</span>
          <span>{n} month{n === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px] items-start">
        <div ref={ref} className="min-w-0 relative" style={{ height: H }}>
          {width > 0 && (
            <svg width={width} height={H} className="block overflow-visible" aria-hidden="true">
              {/* zero axis */}
              <line x1={0} x2={width} y1={y0} y2={y0} stroke="var(--color-border)" strokeWidth="1" />
              {window.map((m, i) => {
                const h = Math.max(m.realized === 0 ? 0 : 2, Math.round(barH(m.realized)));
                const pos = m.realized >= 0;
                const x = cx(i) - barW / 2;
                const y = pos ? y0 - h : y0;
                return (
                  <g key={m.month}>
                    <title>{`${monthLabel(m.month)}: ${money(m.realized, true)} · ${m.closedTrades} closed · cumulative ${money(m.cumulative, true)}`}</title>
                    {h > 0 && <rect x={x} y={y} width={barW} height={h} rx={3} fill={pos ? 'var(--color-green)' : 'var(--color-rose)'} opacity={0.85} />}
                    {showValues && m.active && m.realized !== 0 && (
                      <text x={cx(i)} y={pos ? y - 4 : y0 + h + 11} textAnchor="middle" fontSize="10" fontWeight="600" fill={pos ? 'var(--color-green)' : 'var(--color-rose)'}>{shortMoney(m.realized)}</text>
                    )}
                    <text x={cx(i)} y={P + 14} textAnchor="middle" fontSize="9" fill={m.active ? 'var(--color-text-secondary)' : 'var(--color-text-muted)'}>{monthLabel(m.month)}</text>
                    {m.active && slot >= 34 && (
                      <text x={cx(i)} y={P + 25} textAnchor="middle" fontSize="9" fill="var(--color-text-muted)">{m.closedTrades ? `${m.closedTrades} closed` : '—'}</text>
                    )}
                  </g>
                );
              })}
              {n > 1 && (
                <>
                  <path d={line} fill="none" stroke={cumColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
                  {cum.map((v, i) => <circle key={i} cx={cx(i)} cy={cy(v)} r={i === n - 1 ? 3.5 : 2} fill={cumColor} />)}
                  {showCumLabel && <text x={cx(n - 1)} y={cy(cum[n - 1]) - 7} textAnchor={n > 2 ? 'end' : 'middle'} fontSize="10" fontWeight="700" fill={cumColor}>{shortMoney(cum[n - 1])}</text>}
                </>
              )}
            </svg>
          )}
        </div>

        {/* Figures */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 gap-x-4 gap-y-3 xl:border-l xl:pl-4" style={{ borderColor: 'var(--color-border)' }}>
          {stats.best && figure('Best month', money(stats.best.realized, true), `${monthLabel(stats.best.month)} · ${stats.best.closedTrades} closed`, pnlColor(stats.best.realized))}
          {stats.worst && figure('Worst month', money(stats.worst.realized, true), `${monthLabel(stats.worst.month)} · ${stats.worst.closedTrades} closed`, pnlColor(stats.worst.realized))}
          {figure('Green months', `${stats.greenMonths} of ${stats.activeMonths}`, stats.activeMonths ? `${Math.round((stats.greenMonths / stats.activeMonths) * 100)}% · last 12 months` : 'no activity yet')}
          {stats.avgMonth != null && figure('Average month', money(stats.avgMonth, true), 'over active months', pnlColor(stats.avgMonth))}
          {stats.year && figure(`${stats.year.year} so far`, money(stats.year.realized, true), `${stats.year.closedTrades} closed this year`, pnlColor(stats.year.realized))}
          {figure('All time', money(stats.allTime, true), series.length ? `since ${monthLabel(series[0].month)}` : '', pnlColor(stats.allTime))}
        </div>
      </div>
    </div>
  );
}
