'use client';

import { useMemo, useState } from 'react';
import { matchCategories, matchProjects, normalizeQuery, type ChooserCategory, type ChooserProject } from '@/lib/transactions/categoryChooser';

export interface ChooserDebt { id: string; borrowerName: string; remaining: number; direction: 'lent' | 'owed' }

export interface ChooserValue { categoryId: string; projectId: string; projectCategoryId: string; debtId: string }

type Tab = 'categories' | 'projects' | 'debts';

interface Props<P extends ChooserProject> {
  accent: string;
  /** Main category list for the transaction's direction. */
  categories: ChooserCategory[];
  /** Optional second group, e.g. expense categories offered on an income. */
  secondary?: { label: string; items: ChooserCategory[] };
  projects: P[];
  debts: ChooserDebt[];
  value: ChooserValue;
  onPickCategory: (categoryId: string) => void;
  onPickProjectCategory: (project: P, categoryId: string) => void;
  onPickDebt: (debt: ChooserDebt) => void;
}

const money = (n: number) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

function Chip({ icon, label, sub, color, selected, onClick }: {
  icon: string; label: string; sub?: string; color: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all min-w-0 cursor-pointer hover:brightness-110"
      style={{
        background: selected ? `color-mix(in srgb, ${color} 18%, transparent)` : 'var(--color-surface)',
        border: `1px solid ${selected ? color : 'var(--color-border)'}`,
        boxShadow: selected ? `0 0 0 1px ${color}` : undefined,
      }}>
      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }} aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-tight truncate" style={{ color: selected ? color : 'var(--color-text-primary)' }}>{label}</span>
        {sub && <span className="block text-[11px] truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sub}</span>}
      </span>
      {selected && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="col-span-full text-[10px] font-bold uppercase tracking-wider pt-2 first:pt-0" style={{ color: 'var(--color-text-muted)' }}>{children}</p>;
}

/**
 * Inline category picker for the manual-transaction form. Budget categories,
 * project categories and debt repayments each get a tab; projects open into
 * their own category grid instead of being flattened into one long list.
 * Typing in the search box searches all of them at once.
 */
export default function CategoryChooser<P extends ChooserProject>({
  accent, categories, secondary, projects, debts, value, onPickCategory, onPickProjectCategory, onPickDebt,
}: Props<P>) {
  const [tab, setTab] = useState<Tab>(() => (value.projectCategoryId ? 'projects' : value.debtId ? 'debts' : 'categories'));
  const [openProjectId, setOpenProjectId] = useState<string | null>(() => (value.projectCategoryId ? value.projectId || null : null));
  const [query, setQuery] = useState('');
  const searching = normalizeQuery(query) !== '';

  const catHits = useMemo(() => matchCategories(categories, query), [categories, query]);
  const secHits = useMemo(() => (secondary ? matchCategories(secondary.items, query) : []), [secondary, query]);
  const projHits = useMemo(() => matchProjects(projects, query), [projects, query]);
  const debtHits = useMemo(() => {
    const n = normalizeQuery(query);
    return n ? debts.filter((d) => d.borrowerName.toLowerCase().includes(n)) : debts;
  }, [debts, query]);
  const openProject = projects.find((p) => p.id === openProjectId) ?? null;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'categories', label: 'Categories', count: categories.length + (secondary?.items.length ?? 0) },
    { id: 'projects', label: 'Projects', count: projects.filter((p) => (p.categories ?? []).length > 0).length },
    ...(debts.length > 0 ? [{ id: 'debts' as const, label: 'Debts', count: debts.length }] : []),
  ];

  const isCat = (id: string) => value.categoryId === id && !value.projectCategoryId && !value.debtId;
  const isProjCat = (pid: string, cid: string) => value.projectId === pid && value.projectCategoryId === cid;
  const nothingSelected = !value.categoryId && !value.projectCategoryId && !value.debtId;

  const categoryGrid = (items: ChooserCategory[]) => items.map((c) => (
    <Chip key={c.id} icon={c.icon} label={c.name} color={c.color} selected={isCat(c.id)} onClick={() => onPickCategory(c.id)} />
  ));
  const projectCategoryGrid = (p: P, items: ChooserCategory[], withProjectSub: boolean) => items.map((c) => (
    <Chip key={`${p.id}:${c.id}`} icon={c.icon} label={c.name} sub={withProjectSub ? `${p.icon} ${p.name}` : undefined}
      color={c.color} selected={isProjCat(p.id, c.id)} onClick={() => onPickProjectCategory(p, c.id)} />
  ));
  const debtList = (items: ChooserDebt[]) => items.map((d) => (
    <Chip key={d.id} icon="🤝" label={`${d.direction === 'owed' ? 'Pay back' : 'Repaid by'} ${d.borrowerName}`}
      sub={`${money(d.remaining)} left`} color="var(--color-card-violet)" selected={value.debtId === d.id} onClick={() => onPickDebt(d)} />
  ));
  const empty = (msg: string) => <p className="col-span-full py-8 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>{msg}</p>;

  return (
    <div className="flex flex-col gap-2.5 min-h-0 flex-1">
      {/* Search spans every tab */}
      <label className="flex items-center gap-2 px-3 py-2 rounded-xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search categories, projects, debts…"
          aria-label="Search categories" className="flex-1 min-w-0 bg-transparent outline-none text-sm" style={{ color: 'var(--color-text-primary)' }} />
        {searching && (
          <button type="button" onClick={() => setQuery('')} className="text-xs cursor-pointer" style={{ color: 'var(--color-text-muted)' }} aria-label="Clear search">✕</button>
        )}
      </label>

      {!searching && (
        <div role="tablist" aria-label="Category type" className="flex gap-1 p-1 rounded-xl self-start"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => { setTab(t.id); if (t.id !== 'projects') setOpenProjectId(null); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                style={on
                  ? { background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent, border: `1px solid color-mix(in srgb, ${accent} 35%, transparent)` }
                  : { color: 'var(--color-text-muted)', border: '1px solid transparent' }}>
                {t.label}<span className="opacity-60 tabular-nums">{t.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-y-auto min-h-0 flex-1 -mx-1 px-1" style={{ overscrollBehavior: 'contain' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-1">
          {searching ? (
            <>
              {catHits.length > 0 && <><SectionLabel>Categories</SectionLabel>{categoryGrid(catHits)}</>}
              {secHits.length > 0 && <><SectionLabel>{secondary!.label}</SectionLabel>{categoryGrid(secHits)}</>}
              {projHits.map(({ project, categories: pc }) => (
                <div key={project.id} className="contents">
                  <SectionLabel>{project.icon} {project.name}</SectionLabel>
                  {projectCategoryGrid(project, pc, false)}
                </div>
              ))}
              {debtHits.length > 0 && <><SectionLabel>Debt repayment</SectionLabel>{debtList(debtHits)}</>}
              {catHits.length + secHits.length + projHits.length + debtHits.length === 0 && empty(`Nothing matches “${query.trim()}”.`)}
            </>
          ) : tab === 'categories' ? (
            <>
              <Chip icon="—" label="Uncategorized" color="var(--color-text-muted)" selected={nothingSelected} onClick={() => onPickCategory('')} />
              {categoryGrid(categories)}
              {secondary && secondary.items.length > 0 && <><SectionLabel>{secondary.label}</SectionLabel>{categoryGrid(secondary.items)}</>}
            </>
          ) : tab === 'projects' ? (
            openProject ? (
              <>
                <div className="col-span-full flex items-center gap-2">
                  <button type="button" onClick={() => setOpenProjectId(null)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--color-surface)]"
                    style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                    ‹ All projects
                  </button>
                  <span className="text-sm font-bold truncate">{openProject.icon} {openProject.name}</span>
                </div>
                {(openProject.categories ?? []).length === 0
                  ? empty('This project has no categories yet.')
                  : projectCategoryGrid(openProject, openProject.categories ?? [], false)}
              </>
            ) : projHits.length === 0 ? empty('No active projects with categories.') : (
              projHits.map(({ project, categories: pc }) => {
                const chosen = value.projectId === project.id && !!value.projectCategoryId;
                const color = project.color || 'var(--color-card-violet)';
                return (
                  <button key={project.id} type="button" onClick={() => setOpenProjectId(project.id)}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl text-left cursor-pointer transition-all hover:brightness-110"
                    style={{ background: 'var(--color-surface)', border: `1px solid ${chosen ? color : 'var(--color-border)'}` }}>
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }} aria-hidden="true">{project.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold truncate">{project.name}</span>
                      <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        {chosen ? `Selected: ${pc.find((c) => c.id === value.projectCategoryId)?.name ?? ''}` : `${pc.length} categor${pc.length === 1 ? 'y' : 'ies'}`}
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>›</span>
                  </button>
                );
              })
            )
          ) : (
            debtList(debts)
          )}
        </div>
      </div>
    </div>
  );
}
