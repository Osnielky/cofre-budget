'use client';

import type { BudgetWithSpent, Project } from '@/lib/budgets/types';

function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }

interface TargetsPanelProps {
  targets: BudgetWithSpent[];
  projects: Project[];
  totalTarget: number; totalEarned: number; earnPct: number;
  lastDayLabel: string;
  onAdd: () => void;
  onEdit: (t: BudgetWithSpent) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

export default function TargetsPanel({
  targets, projects, totalTarget, totalEarned, earnPct, lastDayLabel, onAdd, onEdit, onDelete, deletingId,
}: TargetsPanelProps) {
  return (
    <div className="flex flex-col gap-3 p-5 rounded-2xl"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-green)' }}>Income targets</span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            {targets.length}
          </span>
        </div>
        <button type="button" onClick={onAdd}
          className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg hover:brightness-110 transition-all text-white flex items-center gap-1"
          style={{ background: 'var(--color-green)' }}>
          <span className="text-sm leading-none">+</span> Add
        </button>
      </div>

      {targets.length === 0 ? (
        <div className="px-4 py-6 rounded-xl flex flex-col items-center text-center gap-2"
          style={{ background: 'var(--color-elevated)', border: '1px dashed var(--color-border)' }}>
          <span className="text-xl">💵</span>
          <p className="text-xs font-semibold">No income targets yet</p>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Forecast what each category should bring in.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-extrabold tabular-nums">${fmt(totalEarned)}</span>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>of ${fmt(totalTarget)} · {earnPct}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(earnPct, 100)}%`, background: 'var(--color-green)' }} />
            </div>
            <p className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
              ${fmt(Math.max(totalTarget - totalEarned, 0))} still expected before {lastDayLabel}
            </p>
          </div>

          <div className="flex flex-col gap-2 mt-1">
            {targets.map((t) => {
              const earned = Number(t.spent), goal = Number(t.amount), pct = t.percentage, reached = pct >= 100;
              const projCat = t.projectCategoryId ? t.project?.categories?.find((c) => c.id === t.projectCategoryId) : null;
              const displayCat = projCat ?? t.category;
              const tColor = displayCat?.color ?? 'var(--color-green)';
              return (
                <div key={t.id} className="flex flex-col gap-1.5 p-2.5 rounded-xl" style={{ background: 'var(--color-elevated)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0" style={{ background: `${tColor}20` }}>{displayCat?.icon ?? '💼'}</span>
                      <span className="text-[12.5px] font-semibold truncate">{displayCat?.name ?? 'Unknown'}</span>
                      {reached && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>GOAL MET</span>
                      )}
                      {t.project && !reached && (
                        <span className="text-[10px] truncate flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                          {t.project.icon} {t.project.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button type="button" onClick={() => onEdit(t)}
                        className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-[var(--color-surface)] transition-colors text-[10px]"
                        style={{ color: 'var(--color-text-muted)' }}>✏️</button>
                      <button type="button" onClick={() => onDelete(t.id)} disabled={deletingId === t.id}
                        className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-500/20 transition-colors text-[10px] disabled:opacity-40"
                        style={{ color: 'var(--color-text-muted)' }}>{deletingId === t.id ? '…' : '🗑️'}</button>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(pct, 100)}%`, background: reached ? 'var(--color-green)' : tColor }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>${fmt(earned)} of ${fmt(goal)} · {pct}%</span>
                    {t.project && !reached ? null : <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>{reached ? `+$${fmt(earned - goal)}` : `$${fmt(goal - earned)} to go`}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
