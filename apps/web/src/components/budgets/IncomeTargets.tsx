'use client';

import type { ServerBudget } from '@/lib/budgets/assemble';
import type { ProjectLite } from '@/hooks/useBudgetScenario';

function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }

/** Income targets — what each income category should bring in this month.
    Their sum is the "Expected Income" the plan is measured against. */
export default function IncomeTargets({ targets, projects, deletingId, onAdd, onEdit, handleDelete }: {
  targets: ServerBudget[]; projects: ProjectLite[]; deletingId: string | null;
  onAdd: () => void; onEdit: (t: ServerBudget) => void; handleDelete: (id: string) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-3">
                <div className="col-span-full flex items-center justify-between gap-2 min-h-[30px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-green)' }}>Income Targets</span>
                    {targets.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums"
                        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                        {targets.length}
                      </span>
                    )}
                  </div>
                  {targets.length > 0 && (
                    <button type="button"
                      onClick={onAdd}
                      className="px-3 py-1.5 text-[11px] font-semibold rounded-xl hover:brightness-110 transition-all text-white flex items-center gap-1"
                      style={{ background: 'var(--color-green)' }}>
                      <span className="text-sm leading-none">+</span> Add Target
                    </button>
                  )}
                </div>

                {targets.length === 0 ? (
                  <div className="col-span-full px-6 py-8 rounded-2xl flex flex-col items-center text-center gap-3"
                    style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px dashed var(--color-border)' }}>
                    <span className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                      style={{
                        background: 'color-mix(in srgb, var(--color-green) 12%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)',
                      }}>💵</span>
                    <div>
                      <p className="text-sm font-semibold">No income targets yet</p>
                      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                        Forecast what each income category should bring in, and watch it fill as the month unfolds.
                      </p>
                    </div>
                    <button type="button"
                      onClick={onAdd}
                      className="mt-1 px-4 py-2 text-xs font-semibold text-white rounded-xl hover:brightness-110 transition-all"
                      style={{ background: 'var(--color-green)' }}>
                      + Set your first target
                    </button>
                  </div>
                ) : targets.map(t => {
                  const earned  = Number(t.spent);
                  const goal    = Number(t.amount);
                  const pct     = t.percentage;
                  const reached = pct >= 100;
                  const projCat = t.projectCategoryId
                    ? projects.find(p => p.id === t.projectId)?.categories?.find(c => c.id === t.projectCategoryId)
                    : null;
                  const displayCat = projCat ?? t.category;
                  const tColor  = displayCat?.color ?? 'var(--color-green)';
                  return (
                    <div key={t.id} className="p-4 rounded-2xl flex flex-col gap-2.5 relative overflow-hidden"
                      style={{
                        background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
                        border: reached ? '1px solid color-mix(in srgb, var(--color-green) 35%, transparent)' : '1px solid var(--color-border)',
                      }}>
                      <span className="absolute top-0 left-4 w-10 h-0.5 pointer-events-none"
                        style={{ background: reached ? 'var(--color-green)' : tColor, opacity: 0.9 }} />
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                            style={{ background: `${tColor}20`, border: `1px solid ${tColor}30` }}>
                            {displayCat?.icon ?? '💼'}
                          </span>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold truncate">{displayCat?.name ?? 'Unknown'}</span>
                              {reached && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
                                  style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>
                                  GOAL MET
                                </span>
                              )}
                            </div>
                            {t.project && (
                              <span className="text-[11px] truncate flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                                <span>{t.project.icon}</span>
                                <span>{t.project.name}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button type="button"
                            onClick={() => onEdit(t)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-colors text-xs"
                            style={{ color: 'var(--color-text-muted)' }}>✏️</button>
                          <button type="button" onClick={() => handleDelete(t.id)} disabled={deletingId === t.id}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/20 transition-colors text-xs disabled:opacity-40"
                            style={{ color: 'var(--color-text-muted)' }}>{deletingId === t.id ? '…' : '🗑️'}</button>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-lg font-extrabold leading-none tabular-nums"
                          style={{ color: reached ? 'var(--color-green)' : 'var(--color-text-primary)' }}>${fmt(earned)}</span>
                        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>of ${fmt(goal)} expected</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(pct, 100)}%`, background: reached ? 'var(--color-green)' : tColor }} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold" style={{ color: reached ? 'var(--color-green)' : 'var(--color-text-muted)' }}>
                          {reached ? `+$${fmt(earned - goal)} above goal` : `$${fmt(goal - earned)} to go`}
                        </span>
                        <span className="text-[10px] font-bold tabular-nums" style={{ color: reached ? 'var(--color-green)' : 'var(--color-text-secondary)' }}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
    </div>
  );
}
