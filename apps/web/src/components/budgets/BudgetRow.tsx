'use client';

import { deriveBudget, roundUp50 } from '@/lib/budgets/derive';
import type { CategoryTrendPoint } from '@/lib/budgets/derive';
import type { BudgetWithSpent, Transaction } from '@/lib/budgets/types';
import BudgetRowDetail from './BudgetRowDetail';

function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function fmtDate(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
const TONE_COLOR = { green: 'var(--color-green)', amber: 'var(--color-amber)', rose: 'var(--color-rose)' } as const;

/* 1 col (mobile, cells stack) -> 7 cols at md (Per day + trend dropped, flexible category width) -> full 9 fixed-width cols at xl. */
const GRID_CLASSES = 'grid-cols-1 md:grid-cols-[minmax(140px,1fr)_80px_80px_84px_96px_90px_56px] xl:grid-cols-[222px_92px_92px_96px_88px_132px_104px_118px_62px]';

function Sparkline({ points, budgetAmount, color }: { points: number[]; budgetAmount: number; color: string }) {
  const w = 118, h = 26, pad = 3;
  const max = Math.max(budgetAmount, ...points, 1);
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const y = (v: number) => h - pad - (Math.min(v, max) / max) * (h - pad * 2);
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(pad + i * stepX).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const budgetY = y(budgetAmount);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <line x1={pad} y1={budgetY} x2={w - pad} y2={budgetY} stroke="var(--color-text-muted)" strokeWidth={1} strokeDasharray="2 2" opacity={0.5} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface BudgetRowProps {
  budget: BudgetWithSpent;
  month: string; now: Date;
  txs: Transaction[];
  trend: CategoryTrendPoint[];
  avg3mo?: number;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRaise: (newAmount: number) => void;
  deleting: boolean;
}

export default function BudgetRow({
  budget: b, month, now, txs, trend, avg3mo, isExpanded, onToggle, onEdit, onDelete, onRaise, deleting,
}: BudgetRowProps) {
  const d = deriveBudget(b, month, now);
  const catColor = b.category?.color ?? '#818CF8';
  const spent = Number(b.spent), amount = Number(b.amount), remaining = Number(b.remaining);
  const usageColor = TONE_COLOR[d.riskGroup === 'over' ? 'rose' : d.riskGroup === 'near' ? 'amber' : 'green'];
  const raiseTo = roundUp50(d.projected);

  const firstTxDate = txs.length ? [...txs].sort((x, y) => x.date.localeCompare(y.date))[0].date : null;
  const meta = b.sourceMonth && b.sourceMonth < month
    ? `↪ carried from ${monthLabel(b.sourceMonth)}`
    : d.isFixed
      ? (firstTxDate ? `fixed bill · paid ${fmtDate(firstTxDate)}` : 'fixed bill')
      : `${txs.length} transaction${txs.length === 1 ? '' : 's'} · avg $${fmt(txs.length ? spent / txs.length : 0)}`;

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{
        border: isExpanded ? `1px solid ${catColor}50` : '1px solid transparent',
        background: d.riskGroup === 'over' ? 'color-mix(in srgb, var(--color-rose) 4%, transparent)' : 'transparent',
      }}>
      <div role="button" tabIndex={0} aria-expanded={isExpanded} onClick={onToggle}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(); } }}
        className={`grid items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-primary)_3%,transparent)] transition-colors ${GRID_CLASSES}`}>

        {/* Category */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: `${catColor}20`, border: `1px solid ${catColor}30` }}>
            {b.category?.icon ?? '📦'}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold truncate">{b.category?.name ?? 'Unknown'}</p>
            <p className="text-[10.5px] truncate" style={{ color: 'var(--color-text-muted)' }}>{meta}</p>
          </div>
        </div>

        <span className="text-[13px] font-semibold tabular-nums text-right" style={{ color: 'var(--color-text-primary)' }}>${fmt(amount)}</span>
        <span className="text-[13px] font-semibold tabular-nums text-right" style={{ color: usageColor }}>${fmt(spent)}</span>
        <span className="text-[13px] font-semibold tabular-nums text-right" style={{ color: remaining < 0 ? 'var(--color-rose)' : 'var(--color-green)' }}>
          {remaining < 0 ? '−' : ''}${fmt(Math.abs(remaining))}
        </span>
        <span className="hidden xl:block text-[12px] tabular-nums text-right" style={{ color: 'var(--color-text-muted)' }}>
          {d.isFixed ? '—' : remaining < 0 ? 'over' : d.perDay != null ? `$${fmt(d.perDay)}` : '—'}
        </span>

        {/* Usage */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(b.percentage, 100)}%`, background: usageColor }} />
          </div>
          <span className="text-[11px] font-bold tabular-nums w-8 text-right" style={{ color: usageColor }}>{b.percentage}%</span>
        </div>

        <span className="text-[12px] font-semibold tabular-nums text-right" style={{ color: TONE_COLOR[d.projectedTone] }}>${fmt(d.projected)}</span>

        <div className="hidden xl:block">
          <Sparkline points={trend.map((p) => p.total)} budgetAmount={amount} color={catColor} />
        </div>

        <div className="flex items-center justify-end gap-0.5">
          <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-colors text-xs"
            style={{ color: 'var(--color-text-muted)' }}>✏️</button>
          <div className="w-5 h-5 flex items-center justify-center transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', color: 'var(--color-text-muted)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>

      {isExpanded && (
        <BudgetRowDetail budget={b} txs={txs} avg3mo={avg3mo} raiseTo={raiseTo}
          onRaise={() => onRaise(raiseTo)} onDelete={onDelete} deleting={deleting} />
      )}
    </div>
  );
}

export { GRID_CLASSES };
