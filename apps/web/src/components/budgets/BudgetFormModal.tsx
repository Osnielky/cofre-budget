'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { categoryAverageBefore, categoryMonthSpend, daysInMonth, roundUp50 } from '@/lib/budgets/derive';
import type { Category, Project, BudgetWithSpent, Transaction } from '@/lib/budgets/types';
import { API } from '@/hooks/useBudgetScenario';

export interface BudgetFormRequest {
  kind: 'expense' | 'income';
  editing: BudgetWithSpent | null;
  presetCategoryId?: string;
}

interface BudgetForm {
  categoryId: string;
  amount: string;
  projectId: string;
  projectCategoryId: string;
  notifyEnabled: boolean;
  notifyThreshold: number;
  rollover: boolean;
  isRecurring: boolean;
}

const EMPTY_FORM: BudgetForm = {
  categoryId: '', amount: '', projectId: '', projectCategoryId: '',
  notifyEnabled: false, notifyThreshold: 80, rollover: false, isRecurring: false,
};

/** The settings half of the form, in the shape the API expects. */
function formSettings(f: BudgetForm) {
  return { notifyEnabled: f.notifyEnabled, notifyThreshold: f.notifyThreshold, rollover: f.rollover, isRecurring: f.isRecurring };
}

/** Slider ceiling: a round number comfortably above the recommendation. */
function sliderMax(recommended: number, entered: number): number {
  const base = Math.max(recommended * 2, entered * 1.5, 500);
  const mag = Math.pow(10, Math.floor(Math.log10(base)));
  return Math.ceil(base / (mag / 2)) * (mag / 2);
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }

/** Add / edit a spending budget or income target: amount (with history-based
    recommendation), category/project, alert threshold, rollover and recurrence.
    Persists immediately — it edits budget settings, not the draft scenario. */
export default function BudgetFormModal({ request, month, categories, projects, budgets, wideTxs, onClose, onSaved }: {
  request: BudgetFormRequest; month: string; categories: Category[]; projects: Project[]; budgets: BudgetWithSpent[];
  wideTxs: Transaction[]; onClose: () => void; onSaved: () => void;
}) {
  const formKind = request.kind;
  const editingId = request.editing?.id ?? null;
  const [form, setForm] = useState<BudgetForm>(() => {
    const e = request.editing;
    if (!e) return { ...EMPTY_FORM, categoryId: request.presetCategoryId ?? '' };
    return {
      categoryId: e.categoryId ?? '', amount: String(Number(e.amount)), projectId: e.projectId ?? '', projectCategoryId: e.projectCategoryId ?? '',
      notifyEnabled: e.notifyEnabled ?? false, notifyThreshold: e.notifyThreshold ?? 80, rollover: e.rollover ?? false, isRecurring: e.isRecurring ?? false,
    };
  });
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [projectDropOpen, setProjectDropOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const close = onClose;

  const usedIds   = new Set(budgets.map(b => b.categoryId));
  const available = categories.filter(c => (formKind === 'income'
    ? c.type === 'income'
    : c.type !== 'transfer' && c.type !== 'income')
    && (!usedIds.has(c.id) || c.id === form.categoryId));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    setFormError(null);
    if (!Number.isFinite(amt) || amt < 0) { setFormError('Enter a valid, non-negative amount.'); return; }

    const selProj = projects.find(p => p.id === form.projectId);
    const isProjectCatMode = !!selProj && formKind === 'income';
    if (!editingId) {
      if (isProjectCatMode && !form.projectCategoryId) { setFormError('Please select a project category.'); return; }
      if (!isProjectCatMode && !form.categoryId) { setFormError('Please select a category.'); return; }
    }

    setFormSaving(true);
    try {
      const body = editingId
        ? { amount: amt, projectId: form.projectId || null, ...formSettings(form) }
        : form.projectCategoryId
          ? { projectCategoryId: form.projectCategoryId, amount: amt, month, projectId: form.projectId || null, ...formSettings(form) }
          : { categoryId: form.categoryId, amount: amt, month, projectId: form.projectId || null, ...formSettings(form) };
      const res = await fetch(editingId ? `${API}/budgets/${editingId}` : `${API}/budgets`, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('save failed');
      onSaved();
      onClose();
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setFormSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
            {(() => {
              const selProj = projects.find(p => p.id === form.projectId);
              const selCat = categories.find(c => c.id === form.categoryId)
                ?? (form.projectCategoryId ? selProj?.categories?.find(c => c.id === form.projectCategoryId) : undefined);
              const accent = selCat?.color ?? 'var(--color-card-violet)';
              const accentHex = selCat?.color ?? '#818CF8';
              const amt    = parseFloat(form.amount) || 0;
              const isIncome = formKind === 'income';

              // Every derived number below comes from wideTxs (6 months already loaded),
              // windowed on the SELECTED month rather than today.
              const avg3mo = selCat && !isIncome ? categoryAverageBefore(wideTxs, selCat.id, month, 3) : 0;
              const recommended = avg3mo > 0 ? roundUp50(avg3mo * 1.1) : 0;
              const lastMonthSpend = selCat && !isIncome ? categoryMonthSpend(wideTxs, selCat.id, prevMonth(month)) : 0;
              const din = daysInMonth(month);
              const perDay = amt > 0 ? amt / din : 0;
              const vsLast = amt > 0 && lastMonthSpend > 0 ? amt - lastMonthSpend : null;
              const sMax = sliderMax(recommended, amt);
              // Four distinct ascending presets around the recommendation. Rounding
              // can collapse neighbouring multiples into the same value, so walk a
              // wider ladder until four survive.
              const presets = (() => {
                if (recommended <= 0) return [100, 250, 500, 1000];
                const out: number[] = [];
                for (const mult of [0.5, 1, 1.5, 2, 3, 4, 6]) {
                  const v = roundUp50(recommended * mult);
                  if (v > 0 && !out.includes(v)) out.push(v);
                  if (out.length === 4) break;
                }
                return out.sort((a, b) => a - b);
              })();

              return (
                <form onSubmit={handleSubmit}
                  className="w-full max-w-lg flex flex-col rounded-2xl"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)', maxHeight: '92dvh', overflow: 'hidden' }}>

                  {/* Form header */}
                  <div className="px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3 rounded-t-2xl shrink-0"
                    style={{ borderBottom: '1px solid var(--color-border)', background: `linear-gradient(135deg, ${accentHex}12 0%, transparent 60%)` }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ background: `${accentHex}22` }}>
                        {selCat?.icon ?? '🎯'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-lg leading-tight">{editingId
                          ? (isIncome ? 'Edit income target' : 'Edit budget')
                          : (isIncome ? 'Create an income target' : 'Create a budget')}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {isIncome ? 'Set an expected income for' : 'Set a spending limit for'} {monthLabel(month)}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={close}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0"
                      style={{ color: 'var(--color-text-muted)' }}>✕</button>
                  </div>

                  <div className="flex flex-col gap-4 px-5 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1">
                    {/* Project picker — income targets only, shown FIRST */}
                    {formKind === 'income' && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                          Project <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                        </span>
                        <div style={{ position: 'relative' }}>
                          {(() => {
                            const selProj2 = projects.find(p => p.id === form.projectId);
                            const projColor = selProj2?.color ?? '#9B6DFF';
                            return (
                              <>
                                <button type="button" onClick={() => setProjectDropOpen(o => !o)}
                                  className="w-full px-3 py-2.5 text-sm flex items-center gap-2.5 rounded-xl outline-none text-left"
                                  style={{ background: 'var(--color-surface)', border: `1px solid ${selProj2 ? projColor + '44' : 'var(--color-border)'}`, color: selProj2 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                  {selProj2 ? (
                                    <><span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${projColor}20` }}>{selProj2.icon}</span>
                                    <span className="flex-1 font-medium" style={{ color: projColor }}>{selProj2.name}</span></>
                                  ) : <span className="flex-1">Select a project…</span>}
                                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0, transform: projectDropOpen ? 'rotate(180deg)' : undefined }}>
                                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                                {projectDropOpen && (
                                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden overflow-y-auto"
                                    style={{ background: 'var(--popover-bg)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)', zIndex: 10, maxHeight: '50vh' }}>
                                    <button type="button"
                                      onClick={() => { setForm(f => ({ ...f, projectId: '', categoryId: '' })); setProjectDropOpen(false); }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                      style={{ background: form.projectId === '' ? 'rgba(155,109,255,0.08)' : 'transparent', color: form.projectId === '' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
                                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(155,109,255,0.06)')}
                                      onMouseLeave={e => (e.currentTarget.style.background = form.projectId === '' ? 'rgba(155,109,255,0.08)' : 'transparent')}>
                                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: 'rgba(155,109,255,0.12)' }}>—</span>
                                      <span className="font-medium">None</span>
                                    </button>
                                    {projects.filter(p => p.status === 'active').map(p => {
                                      const pc = p.color ?? '#9B6DFF';
                                      return (
                                        <button key={p.id} type="button"
                                          onClick={() => { setForm(f => ({ ...f, projectId: p.id, categoryId: '' })); setProjectDropOpen(false); }}
                                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                          style={{ background: form.projectId === p.id ? `${pc}18` : 'transparent', color: form.projectId === p.id ? pc : 'var(--color-text-primary)' }}
                                          onMouseEnter={e => (e.currentTarget.style.background = `${pc}12`)}
                                          onMouseLeave={e => (e.currentTarget.style.background = form.projectId === p.id ? `${pc}18` : 'transparent')}>
                                          <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${pc}20` }}>{p.icon}</span>
                                          <span className="font-medium">{p.name}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Category picker */}
                    {(() => {
                      const selProj2 = formKind === 'income' ? projects.find(p => p.id === form.projectId) : null;
                      const projCats = selProj2?.categories ?? [];
                      const catList: { id: string; name: string; icon: string; color: string }[] =
                        selProj2 ? projCats : available;
                      const isProjectCatMode = !!selProj2 && formKind === 'income';
                      const activeCatId = isProjectCatMode ? form.projectCategoryId : form.categoryId;
                      return (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Category</span>
                      <div style={{ position: 'relative' }}>
                        <button type="button" disabled={!!editingId} onClick={() => setCatDropOpen(o => !o)}
                          className="w-full px-3 py-2.5 text-sm flex items-center gap-2.5 rounded-xl outline-none text-left disabled:opacity-60"
                          style={{ background: 'var(--color-surface)', border: `1px solid ${selCat ? accentHex + '44' : 'var(--color-border)'}`, color: selCat ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                          {selCat ? (
                            <><span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${accentHex}20` }}>{selCat.icon}</span>
                            <span className="flex-1 font-medium" style={{ color: accentHex }}>{selCat.name}</span></>
                          ) : <span className="flex-1">Select a category…</span>}
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0, transform: catDropOpen ? 'rotate(180deg)' : undefined }}>
                            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        {catDropOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden overflow-y-auto"
                            style={{ background: 'var(--popover-bg)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)', zIndex: 10, maxHeight: '50vh' }}>
                            {catList.length === 0 && (
                              <p className="px-3 py-2.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>No categories available</p>
                            )}
                            {catList.map(c => (
                              <button key={c.id} type="button"
                                onClick={() => {
                                  if (isProjectCatMode) {
                                    setForm(f => ({ ...f, projectCategoryId: c.id, categoryId: '' }));
                                  } else {
                                    setForm(f => ({ ...f, categoryId: c.id, projectCategoryId: '' }));
                                  }
                                  setCatDropOpen(false);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                style={{ background: activeCatId === c.id ? `${c.color}18` : 'transparent', color: activeCatId === c.id ? c.color : 'var(--color-text-primary)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = `${c.color}12`)}
                                onMouseLeave={e => (e.currentTarget.style.background = activeCatId === c.id ? `${c.color}18` : 'transparent')}>
                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                                <span className="font-medium">{c.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                      );
                    })()}

                    {/* Amount */}
                    <div className="flex flex-col gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                        {isIncome ? 'Expected Income' : 'Monthly Limit'}
                      </span>
                      <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${amt > 0 ? accentHex + '55' : 'var(--color-border)'}` }}>
                        <span className="flex items-center px-4 text-lg font-semibold shrink-0"
                          style={{ background: 'var(--color-surface)', color: amt > 0 ? accentHex : 'var(--color-text-muted)', borderRight: '1px solid var(--color-border)' }}>$</span>
                        <input required type="number" inputMode="decimal" step="0.01" min="1" placeholder="0.00" autoFocus={!!editingId}
                          value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                          className="flex-1 px-4 py-3 text-2xl outline-none font-bold tabular-nums min-w-0"
                          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-primary)' }} />
                      </div>

                      {/* Insight row — only when there is real history to draw on */}
                      {avg3mo > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-surface)' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M4 20V10M10 20V4M16 20v-6M22 20H2" />
                              </svg>
                            </span>
                            3-month average: <strong style={{ color: 'var(--color-text-primary)' }}>${fmt(avg3mo)}</strong>
                          </span>
                          <button type="button" onClick={() => setForm(f => ({ ...f, amount: String(recommended) }))}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:brightness-110"
                            style={{ background: `${accentHex}18`, border: `1px solid ${accentHex}44`, color: accentHex }}>
                            ✦ Recommended: ${recommended.toLocaleString()}
                          </button>
                        </div>
                      )}

                      {/* Slider */}
                      <div className="flex flex-col gap-1.5">
                        <input type="range" min={0} max={sMax} step={sMax / 100}
                          value={Math.min(amt, sMax)}
                          onChange={e => setForm(f => ({ ...f, amount: String(Math.round(Number(e.target.value))) }))}
                          aria-label={isIncome ? 'Expected income' : 'Monthly limit'}
                          className="budget-slider"
                          style={{
                            ['--slider-accent' as string]: accentHex,
                            ['--slider-pct' as string]: `${sMax > 0 ? (Math.min(amt, sMax) / sMax) * 100 : 0}%`,
                          }} />
                        <div className="flex justify-between text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          <span>$0</span><span>${(sMax / 2).toLocaleString()}</span><span>${sMax.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Quick amounts */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {presets.map(q => {
                          const on = Number(form.amount) === q;
                          const isRec = recommended > 0 && q === recommended;
                          return (
                            <button key={q} type="button" onClick={() => setForm(f => ({ ...f, amount: String(q) }))}
                              className="py-2 rounded-lg text-xs font-semibold transition-all leading-tight"
                              style={{
                                background: on ? `${accentHex}22` : 'var(--color-surface)',
                                border: `1px solid ${on ? accentHex + '44' : 'var(--color-border)'}`,
                                color: on ? accentHex : 'var(--color-text-muted)',
                              }}>
                              ${q.toLocaleString()}
                              {isRec && <span className="block text-[10px] font-medium opacity-80">Recommended</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Allowance stats — self-consistent: weekly is exactly 7 daily */}
                    {amt > 0 && (
                      <div className="flex flex-wrap gap-2 rounded-xl px-3 py-3"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Daily allowance</p>
                          <p className="text-sm font-bold tabular-nums">${fmt(perDay)}</p>
                        </div>
                        <div className="flex-1 min-w-0" style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: 12 }}>
                          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Weekly allowance</p>
                          <p className="text-sm font-bold tabular-nums">${fmt(perDay * 7)}</p>
                        </div>
                        <div className="flex-1 min-w-0" style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: 12 }}>
                          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>vs. last month</p>
                          <p className="text-sm font-bold tabular-nums"
                            style={{ color: vsLast === null ? 'var(--color-text-muted)' : vsLast >= 0 ? 'var(--color-amber)' : 'var(--color-green)' }}>
                            {vsLast === null ? '—' : `${vsLast >= 0 ? '+' : '−'}$${fmt(vsLast)}`}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Notify threshold */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-3"
                      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                      <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0" style={{ background: `${accentHex}18` }}>🔔</span>
                      <div className="flex-1 basis-40 min-w-0">
                        <p className="text-sm font-semibold leading-tight">Notify me when I reach {form.notifyThreshold}%</p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Get a heads up before you hit your limit.</p>
                      </div>
                      <div className="flex items-center gap-2 ml-auto shrink-0">
                        <select value={form.notifyThreshold} disabled={!form.notifyEnabled}
                          onChange={e => setForm(f => ({ ...f, notifyThreshold: Number(e.target.value) }))}
                          aria-label="Alert threshold"
                          className="px-2 py-1.5 rounded-lg text-xs font-semibold outline-none disabled:opacity-40"
                          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                          {[50, 60, 70, 75, 80, 90, 100].map(p => <option key={p} value={p}>{p}%</option>)}
                        </select>
                        <button type="button" role="switch" aria-checked={form.notifyEnabled}
                          aria-label="Enable budget alert"
                          onClick={() => setForm(f => ({ ...f, notifyEnabled: !f.notifyEnabled }))}
                          className="w-11 h-6 rounded-full shrink-0 transition-colors relative"
                          style={{ background: form.notifyEnabled ? accentHex : 'var(--color-border)' }}>
                          <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                            style={{ left: form.notifyEnabled ? 22 : 2 }} />
                        </button>
                      </div>
                    </div>

                    {/* More options */}
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                      <button type="button" onClick={() => setMoreOpen(o => !o)} aria-expanded={moreOpen}
                        className="w-full flex items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--color-surface)]">
                        <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0" style={{ background: 'var(--color-surface)' }}>⚙️</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-tight">More options</p>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Rollover unused funds, set as recurring, and more</p>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0"
                          style={{ opacity: 0.5, transform: moreOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
                          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {moreOpen && (
                        <div className="flex flex-col" style={{ borderTop: '1px solid var(--color-border)' }}>
                          {([
                            { key: 'rollover' as const, label: 'Roll over unused funds', hint: "Add what you don't spend to next month." },
                            { key: 'isRecurring' as const, label: 'Repeat every month', hint: 'Recreate this budget in months without one.' },
                          ]).map(opt => (
                            <label key={opt.key} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-tight">{opt.label}</p>
                                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{opt.hint}</p>
                              </div>
                              <button type="button" role="switch" aria-checked={form[opt.key]} aria-label={opt.label}
                                onClick={() => setForm(f => ({ ...f, [opt.key]: !f[opt.key] }))}
                                className="w-11 h-6 rounded-full shrink-0 transition-colors relative"
                                style={{ background: form[opt.key] ? accentHex : 'var(--color-border)' }}>
                                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                                  style={{ left: form[opt.key] ? 22 : 2 }} />
                              </button>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 px-5 sm:px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
                    {formError && (
                      <p className="text-xs font-medium text-center" style={{ color: 'var(--color-rose)' }}>{formError}</p>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={close}
                        className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
                        style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
                      <button type="submit" disabled={formSaving}
                        className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all disabled:opacity-60"
                        style={{ background: accent }}>
                        {formSaving ? 'Saving…' : editingId ? 'Save changes' : (formKind === 'income' ? 'Create target' : 'Create budget')}
                      </button>
                    </div>
                  </div>
                </form>
              );
            })()}
    </div>,
    document.body,
  );
}
