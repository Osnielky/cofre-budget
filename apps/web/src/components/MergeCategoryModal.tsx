'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Category } from './CategoryFormModal';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Props {
  /** The category being folded away. */
  source: Category;
  categories: Category[];
  onClose: () => void;
  /** Called with the surviving category (possibly renamed) after a successful merge. */
  onMerged: (survivor: Category, removedId: string) => void;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-elevated)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
};

/** Fold `source` into another category: its transactions, budgets and rules move
 *  over, the survivor keeps its icon and colour and may take a new name. */
export default function MergeCategoryModal({ source, categories, onClose, onMerged }: Props) {
  const [targetId, setTargetId] = useState('');
  const [name, setName] = useState('');
  const [usage, setUsage] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Same-type categories first; the rest are still allowed (a "both" can absorb an expense).
  const options = useMemo(() => {
    const others = categories.filter((c) => c.id !== source.id);
    const same = others.filter((c) => c.type === source.type);
    const rest = others.filter((c) => c.type !== source.type);
    return { same, rest };
  }, [categories, source]);

  const target = categories.find((c) => c.id === targetId) ?? null;

  useEffect(() => {
    fetch(`${API}/categories/${source.id}/usage`, { credentials: 'include' })
      .then((r) => r.json()).then((d) => setUsage(d.count ?? 0)).catch(() => setUsage(0));
  }, [source.id]);

  // Pre-fill the name with the target's whenever the target changes.
  useEffect(() => { if (target) setName(target.name); }, [target]);

  async function submit() {
    if (!target) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`${API}/categories/${source.id}/merge`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: target.id, name: name.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'Could not merge these categories.');
      onMerged(await res.json(), source.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not merge these categories.');
    } finally { setBusy(false); }
  }

  const optionRow = (c: Category) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>;
  const finalName = name.trim() || target?.name || '';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="merge-title"
        className="w-full max-w-md rounded-2xl flex flex-col gap-5 p-6"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${source.color}20` }}>
            {source.icon}
          </div>
          <div className="min-w-0">
            <p id="merge-title" className="font-bold text-base">Merge “{source.name}” into another category</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {usage == null ? 'Counting transactions…' : `${usage} transaction${usage === 1 ? '' : 's'} will move. “${source.name}” is then deleted. This cannot be undone.`}
            </p>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Merge into</span>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)} autoFocus
            className="w-full px-3 py-2.5 text-sm rounded-xl outline-none appearance-none" style={inputStyle}>
            <option value="">Select a category…</option>
            {options.same.length > 0 && <optgroup label={`Other ${source.type} categories`}>{options.same.map(optionRow)}</optgroup>}
            {options.rest.length > 0 && <optgroup label="Everything else">{options.rest.map(optionRow)}</optgroup>}
          </select>
        </label>

        {target && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Name of the merged category</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
              className="w-full px-3 py-2.5 text-sm rounded-xl outline-none" style={inputStyle} />
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {[target.name, source.name].filter((n, i, a) => a.indexOf(n) === i).map((n) => (
                <button key={n} type="button" onClick={() => setName(n)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors"
                  style={name.trim() === n
                    ? { background: 'color-mix(in srgb, var(--color-primary) 18%, transparent)', color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 35%, transparent)' }
                    : { color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Keeps {target.icon} and the colour of “{target.name}”. Budgets for the same month are added together; rules and recurring payments follow the merged category.
            </p>
          </div>
        )}

        {error && <p className="text-xs" style={{ color: 'var(--color-rose)' }} role="alert">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-[var(--color-surface)]"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!target || busy || !finalName}
            className="btn-gold px-4 py-2 text-sm font-semibold rounded-xl transition-all disabled:opacity-40">
            {busy ? 'Merging…' : target ? `Merge into ${finalName}` : 'Merge categories'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
