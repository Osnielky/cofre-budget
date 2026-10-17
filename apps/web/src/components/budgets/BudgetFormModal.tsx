'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Category } from '@/lib/dashboard/types';
import type { ServerBudget } from '@/lib/budgets/assemble';
import { API, type ProjectCategory, type ProjectLite } from '@/hooks/useBudgetScenario';

export interface BudgetFormRequest {
  kind: 'expense' | 'income';
  editing: ServerBudget | null;
  presetCategoryId?: string;
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

/** Add / edit a spending budget or income target (amount, category, project). */
export default function BudgetFormModal({ request, month, categories, projects, budgets, onClose, onSaved }: {
  request: BudgetFormRequest; month: string; categories: Category[]; projects: ProjectLite[]; budgets: ServerBudget[];
  onClose: () => void; onSaved: () => void;
}) {
  const formKind = request.kind;
  const editingId = request.editing?.id ?? null;
  const [form, setForm] = useState(() => request.editing
    ? { categoryId: request.editing.categoryId ?? '', amount: String(Number(request.editing.amount)), projectId: request.editing.projectId ?? '', projectCategoryId: request.editing.projectCategoryId ?? '' }
    : { categoryId: request.presetCategoryId ?? '', amount: '', projectId: '', projectCategoryId: '' });
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [projectDropOpen, setProjectDropOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const usedIds = new Set(budgets.map(b => b.categoryId));
  const available = categories.filter(c => (formKind === 'income'
    ? c.type === 'income'
    : c.type !== 'transfer' && c.type !== 'income')
    && (!usedIds.has(c.id) || c.id === form.categoryId));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    setFormError(null);
    if (!Number.isFinite(amt) || amt < 0) { setFormError('Enter a valid, non-negative amount.'); return; }

    /* Validate: a category must always be selected */
    const selProj = projects.find(p => p.id === form.projectId);
    const isProjectCatMode = !!selProj && formKind === 'income';
    if (!editingId) {
      if (isProjectCatMode && !form.projectCategoryId) { setFormError('Please select a project category.'); return; }
      if (!isProjectCatMode && !form.categoryId) { setFormError('Please select a category.'); return; }
    }

    setFormSaving(true);
    try {
      const body = editingId
        ? { amount: amt, projectId: form.projectId || null }
        : form.projectCategoryId
          ? { projectCategoryId: form.projectCategoryId, amount: amt, month, projectId: form.projectId || null }
          : { categoryId: form.categoryId, amount: amt, month, projectId: form.projectId || null };
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
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            {(() => {
              const selProj = projects.find(p => p.id === form.projectId);
              const selCat = categories.find(c => c.id === form.categoryId)
                ?? (form.projectCategoryId ? selProj?.categories?.find(c => c.id === form.projectCategoryId) : undefined);
              const accent = selCat?.color ?? 'var(--color-card-violet)';
              const accentHex = selCat?.color ?? '#818CF8';
              const amt    = parseFloat(form.amount) || 0;
              return (
                <form onSubmit={handleSubmit}
                  className="w-full max-w-sm flex flex-col rounded-2xl"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)' }}>

                  {/* Form header */}
                  <div className="px-5 py-4 flex items-center justify-between gap-3 rounded-t-2xl"
                    style={{ borderBottom: '1px solid var(--color-border)', background: `linear-gradient(135deg, ${accentHex}12 0%, transparent 60%)` }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${accentHex}22` }}>
                        {selCat?.icon ?? '🎯'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm">{selCat?.name ?? (editingId
                          ? (formKind === 'income' ? 'Edit Income Target' : 'Edit Budget')
                          : (formKind === 'income' ? 'New Income Target' : 'New Budget'))}</p>
                        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          {amt > 0 ? `$${amt.toLocaleString()} / month` : monthLabel(month)}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={onClose}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0"
                      style={{ color: 'var(--color-text-muted)' }}>✕</button>
                  </div>

                  <div className="flex flex-col gap-4 px-5 py-4">
                    {/* Project picker — income targets only, shown FIRST */}
                    {formKind === 'income' && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                          Project <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                        </span>
                        <div style={{ position: 'relative' }}>
                          {(() => {
                            const selProj = projects.find(p => p.id === form.projectId);
                            const projColor = selProj?.color ?? '#9B6DFF';
                            return (
                              <>
                                <button type="button" onClick={() => setProjectDropOpen(o => !o)}
                                  className="w-full px-3 py-2.5 text-sm flex items-center gap-2.5 rounded-xl outline-none text-left"
                                  style={{ background: 'var(--color-surface)', border: `1px solid ${selProj ? projColor + '44' : 'var(--color-border)'}`, color: selProj ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                  {selProj ? (
                                    <><span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${projColor}20` }}>{selProj.icon}</span>
                                    <span className="flex-1 font-medium" style={{ color: projColor }}>{selProj.name}</span></>
                                  ) : <span className="flex-1">Select a project…</span>}
                                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0, transform: projectDropOpen ? 'rotate(180deg)' : undefined }}>
                                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                                {projectDropOpen && (
                                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden overflow-y-auto"
                                    style={{ background: 'var(--popover-bg)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)', zIndex: 10, maxHeight: '50vh' }}>
                                    {/* None option */}
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
                      const selProj = formKind === 'income' ? projects.find(p => p.id === form.projectId) : null;
                      const projCats: ProjectCategory[] = selProj?.categories ?? [];
                      const catList: { id: string; name: string; icon: string; color: string }[] =
                        selProj ? projCats : available;
                      const isProjectCatMode = !!selProj && formKind === 'income';
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
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                        {formKind === 'income' ? 'Expected Income' : 'Monthly Limit'}
                      </span>
                      <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${amt > 0 ? accentHex + '55' : 'var(--color-border)'}` }}>
                        <span className="flex items-center px-3 text-sm font-semibold shrink-0"
                          style={{ background: 'var(--color-surface)', color: amt > 0 ? accentHex : 'var(--color-text-muted)', borderRight: '1px solid var(--color-border)' }}>$</span>
                        <input required type="number" step="0.01" min="1" placeholder="0.00" autoFocus={!!editingId}
                          value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                          className="flex-1 px-3 py-2.5 text-sm outline-none font-semibold"
                          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-primary)' }} />
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[100,250,500,1000].map(q => (
                          <button key={q} type="button" onClick={() => setForm(f => ({ ...f, amount: String(q) }))}
                            className="py-1.5 rounded-lg text-xs font-semibold transition-all"
                            style={{
                              background: Number(form.amount) === q ? `${accentHex}22` : 'var(--color-surface)',
                              border: `1px solid ${Number(form.amount) === q ? accentHex + '44' : 'var(--color-border)'}`,
                              color: Number(form.amount) === q ? accentHex : 'var(--color-text-muted)',
                            }}>
                            ${q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                    {formError && (
                      <p className="text-xs font-medium text-center" style={{ color: 'var(--color-rose)' }}>{formError}</p>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={onClose}
                        className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
                        style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
                      <button type="submit" disabled={formSaving}
                        className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all disabled:opacity-60"
                        style={{ background: accent }}>
                        {formSaving ? 'Saving…' : editingId ? 'Save Changes' : (formKind === 'income' ? 'Create Target' : 'Create Budget')}
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
