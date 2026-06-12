'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from '@/components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const PRESET_COLORS = ['#9B6DFF', '#4FBF7F', '#F07A3E', '#F5C842', '#4BA8D8', '#E879A0'];

const PROJECT_TYPES: { value: string; label: string; icon: string; placeholder: string; hint: string }[] = [
  { value: 'vehicle',  label: 'Vehicle',  icon: '🚗', placeholder: 'e.g. 2019 Honda Civic',      hint: 'Flip, fix or track a vehicle' },
  { value: 'property', label: 'Property', icon: '🏠', placeholder: 'e.g. Miami Rental Property', hint: 'Real estate & rentals' },
  { value: 'business', label: 'Business', icon: '💼', placeholder: 'e.g. Coffee Shop',           hint: 'Product-based business' },
  { value: 'service',  label: 'Business', icon: '💼', placeholder: 'e.g. Uber, Consulting, Freelance', hint: 'Service-based business' },
  { value: 'other',    label: 'Other',    icon: '📦', placeholder: 'e.g. Camera Collection',     hint: 'Any investment or project' },
];

const MAIN_TYPES = [
  { value: 'vehicle',  label: 'Vehicle',  icon: '🚗' },
  { value: 'property', label: 'Property', icon: '🏠' },
  { value: 'business', label: 'Business', icon: '💼' },
  { value: 'other',    label: 'Other',    icon: '📦' },
];

const BUSINESS_SUBTYPES = [
  { value: 'business', label: 'Product', icon: '📦', hint: 'Sell physical or digital products' },
  { value: 'service',  label: 'Service', icon: '🛎️', hint: 'Offer skills, consulting or labor' },
];

interface ProjectCategory {
  id: string; name: string; icon: string; color: string; order: number; type: string;
}

interface CategoryBreakdown extends ProjectCategory {
  total: number; txCount: number;
}

interface BankAccount {
  id: string; bankName: string; accountName: string; accountType: string;
}

interface Transaction {
  id: string; name: string; amount: number; date: string;
  categoryRef: { name: string; icon: string; color: string } | null;
  bankAccount: BankAccount | null;
  projectId: string | null;
  projectCategoryId: string | null;
  projectCategory?: ProjectCategory | null;
}

interface Project {
  id: string; name: string; type: string; icon: string; color: string;
  description: string | null; purchasePrice: number; purchaseDate: string | null;
  status: string; salePrice: number | null; saleDate: string | null;
  expenses: number; income: number; costBasis: number;
  netGain: number | null; roi: number | null; txCount: number;
  transactions?: Transaction[];
  categories?: ProjectCategory[];
  categoryBreakdown?: CategoryBreakdown[];
}

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--color-elevated)', border: '1px solid var(--color-border)',
  borderRadius: '10px', color: 'var(--color-text-primary)',
};

export default function ProjectsPage() {
  const [projects, setProjects]     = useState<Project[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState<Project | null>(null);
  const [showSell, setShowSell]       = useState<Project | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);

  /* Link picker state */
  const [showLinkPicker, setShowLinkPicker] = useState<string | null>(null); // projectId
  const [allTx, setAllTx]                   = useState<Transaction[]>([]);
  const [txSearch, setTxSearch]             = useState('');
  const [linking, setLinking]               = useState(false);
  /* Two-step link: after picking a tx, pick a project category */
  const [pendingLinkTx, setPendingLinkTx]   = useState<Transaction | null>(null);
  const [pendingCatId, setPendingCatId]     = useState<string>('');

  /* Collapsed categories per project */
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const toggleCats = (id: string) => setCollapsedCats((p) => ({ ...p, [id]: !p[id] }));

  /* Category management */
  const [showCatForm, setShowCatForm]   = useState<string | null>(null); // projectId
  const [catForm, setCatForm]           = useState({ name: '', icon: '📦', color: '#9B6DFF' });
  const [savingCat, setSavingCat]       = useState(false);
  const [deletingCat, setDeletingCat]   = useState<string | null>(null);
  const [seedingCat, setSeedingCat]     = useState<string | null>(null);

  /* Project form state */
  const emptyForm = { name: '', type: 'vehicle', icon: '🚗', color: PRESET_COLORS[0], description: '', purchasePrice: '', purchaseDate: '' };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  /* Sell form */
  const [sellForm, setSellForm] = useState({ salePrice: '', saleDate: new Date().toISOString().slice(0, 10) });
  const [selling, setSelling]   = useState(false);
  const [sellMode, setSellMode]           = useState<'bank' | 'cash'>('bank');
  const [sellAllTx, setSellAllTx]         = useState<Transaction[]>([]);
  const [sellTxSearch, setSellTxSearch]   = useState('');
  const [sellLinkedTx, setSellLinkedTx]   = useState<Transaction | null>(null);
  const [sellLoadingTx, setSellLoadingTx] = useState(false);

  useEffect(() => { loadProjects(); }, []);

  useEffect(() => {
    if (!showSell) return;
    setSellLinkedTx(null); setSellTxSearch(''); setSellMode('bank');
    if (sellAllTx.length === 0) {
      setSellLoadingTx(true);
      fetch(`${API}/transactions?limit=1000`, { credentials: 'include' })
        .then((r) => r.json()).then(setSellAllTx)
        .catch(() => {})
        .finally(() => setSellLoadingTx(false));
    }
  }, [showSell?.id]);

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/projects`, { credentials: 'include' });
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }

  async function loadDetail(id: string) {
    const res  = await fetch(`${API}/projects/${id}`, { credentials: 'include' });
    const data: Project = await res.json();
    setProjects((prev) => prev.map((p) => (p.id === id ? data : p)));
  }

  /* Load all transactions for the link picker */
  async function openLinkPicker(projectId: string) {
    setTxSearch(''); setPendingLinkTx(null); setPendingCatId('');
    setShowLinkPicker(projectId);
    if (allTx.length === 0) {
      const res = await fetch(`${API}/transactions?limit=1000`, { credentials: 'include' });
      setAllTx(await res.json());
    }
  }

  /* Step 1: user clicked a transaction row */
  function selectTxForLink(tx: Transaction, projectId: string) {
    if (tx.projectId === projectId) {
      /* Already linked — unlink immediately */
      doUnlink(tx, projectId);
      return;
    }
    /* Not yet linked — move to step 2: pick project category */
    setPendingLinkTx(tx);
    setPendingCatId('');
  }

  /* Step 2: confirm link with chosen category */
  async function confirmLink(projectId: string) {
    if (!pendingLinkTx) return;
    setLinking(true);
    try {
      await fetch(`${API}/projects/${projectId}/link/${pendingLinkTx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectCategoryId: pendingCatId || null }),
      });
      setAllTx((prev) => prev.map((t) => t.id === pendingLinkTx.id ? { ...t, projectId, projectCategoryId: pendingCatId || null } : t));
      await loadDetail(projectId);
      setPendingLinkTx(null); setPendingCatId('');
    } finally { setLinking(false); }
  }

  async function doUnlink(tx: Transaction, projectId: string) {
    setLinking(true);
    try {
      await fetch(`${API}/projects/${projectId}/unlink/${tx.id}`, { method: 'PATCH', credentials: 'include' });
      setAllTx((prev) => prev.map((t) => t.id === tx.id ? { ...t, projectId: null, projectCategoryId: null } : t));
      await loadDetail(projectId);
    } finally { setLinking(false); }
  }

  /* Change project category on an already-linked transaction */
  async function reassignTxCategory(txId: string, projectId: string, projectCategoryId: string | null) {
    await fetch(`${API}/projects/${projectId}/tx/${txId}/category`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ projectCategoryId }),
    });
    await loadDetail(projectId);
  }

  /* Create / update project */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const body = { ...form, purchasePrice: parseFloat(form.purchasePrice) || 0, purchaseDate: form.purchaseDate || null };
      const url    = editing ? `${API}/projects/${editing.id}` : `${API}/projects`;
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const saved: Project = await res.json();
      setProjects((prev) => editing ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev]);
      closeForm();
    } finally { setSaving(false); }
  }

  /* Mark as sold */
  async function handleSell(e: React.FormEvent) {
    e.preventDefault();
    if (!showSell) return;
    setSelling(true);
    try {
      const receiptTxId: string | null = sellLinkedTx?.id ?? null;

      /* Mark project as sold */
      const res = await fetch(`${API}/projects/${showSell.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status: 'sold', salePrice: parseFloat(sellForm.salePrice) || 0, saleDate: sellForm.saleDate }),
      });
      if (!res.ok) return;
      const updated: Project = await res.json();

      /* Link receipt transaction tagged as "Sale Income" */
      if (receiptTxId) {
        const saleIncomeCat = (showSell.categories ?? []).find((c) => c.name === 'Sale Income');
        await fetch(`${API}/projects/${showSell.id}/link/${receiptTxId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ projectCategoryId: saleIncomeCat?.id ?? null }),
        });
      }

      setProjects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      if (expandedId === showSell.id) await loadDetail(showSell.id);
      setShowSell(null);
      setSellLinkedTx(null); setSellAllTx([]);
    } finally { setSelling(false); }
  }

  /* Delete project */
  async function handleDelete(project: Project) {
    setDeleting(project.id);
    try {
      await fetch(`${API}/projects/${project.id}`, { method: 'DELETE', credentials: 'include' });
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      if (expandedId === project.id) setExpandedId(null);
    } finally { setDeleting(null); setConfirmDelete(null); }
  }

  /* Add project category */
  async function handleAddCat(e: React.FormEvent, projectId: string) {
    e.preventDefault(); setSavingCat(true);
    try {
      const res = await fetch(`${API}/projects/${projectId}/categories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(catForm),
      });
      if (!res.ok) return;
      await loadDetail(projectId);
      setCatForm({ name: '', icon: '📦', color: '#9B6DFF' });
      setShowCatForm(null);
    } finally { setSavingCat(false); }
  }

  /* Seed default categories for existing project */
  async function handleSeedCats(projectId: string) {
    setSeedingCat(projectId);
    try {
      await fetch(`${API}/projects/${projectId}/categories/seed`, { method: 'POST', credentials: 'include' });
      await loadDetail(projectId);
    } finally { setSeedingCat(null); }
  }

  /* Delete project category */
  async function handleDeleteCat(projectId: string, catId: string) {
    setDeletingCat(catId);
    try {
      await fetch(`${API}/projects/${projectId}/categories/${catId}`, { method: 'DELETE', credentials: 'include' });
      await loadDetail(projectId);
    } finally { setDeletingCat(null); }
  }

  function openCreate() { setEditing(null); setForm(emptyForm); setShowForm(true); }
  function openEdit(p: Project) {
    setEditing(p);
    setForm({ name: p.name, type: p.type, icon: p.icon, color: p.color, description: p.description ?? '', purchasePrice: String(p.purchasePrice), purchaseDate: p.purchaseDate ?? '' });
    setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditing(null); setSaving(false); }

  const filtered = allTx.filter((t) =>
    !txSearch || t.name.toLowerCase().includes(txSearch.toLowerCase())
  );

  const filteredSellTx = sellAllTx
    .filter((t) => {
      if (Number(t.amount) <= 0) return false;
      const type = t.bankAccount?.accountType ?? '';
      if (sellMode === 'cash' && type !== 'cash') return false;
      if (sellMode === 'bank' && !['checking', 'savings', 'debit'].includes(type)) return false;
      return !sellTxSearch || t.name.toLowerCase().includes(sellTxSearch.toLowerCase());
    })
    .slice(0, 60);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-20 px-6 pt-5 pb-4 flex items-center justify-between gap-3"
          style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Track cost basis and P&amp;L on investments — cars, property, businesses.
            </p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110"
            style={{ background: 'var(--color-card-violet)' }}>
            <PlusIcon /> New Project
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">

          {loading && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}

          {!loading && projects.length === 0 && (
            <div className="mt-16 flex flex-col items-center gap-4 text-center">
              <span className="text-6xl opacity-30">📦</span>
              <p className="font-semibold text-lg">No projects yet</p>
              <p className="text-sm max-w-sm" style={{ color: 'var(--color-text-muted)' }}>
                Track investments like a car flip, rental property, or business. Record every expense and see your real P&amp;L when you sell.
              </p>
              <button onClick={openCreate}
                className="mt-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl hover:brightness-110"
                style={{ background: 'var(--color-card-violet)' }}>
                Create your first project
              </button>
            </div>
          )}

          {projects.map((p) => {
            const color      = p.color || '#9B6DFF';
            const isExpanded = expandedId === p.id;
            const sold       = p.status === 'sold';

            return (
              <div key={p.id} className="rounded-2xl overflow-hidden flex flex-col"
                style={{
                  border: `1px solid ${color}55`,
                  background: `linear-gradient(135deg, ${color}28 0%, ${color}0a 50%, rgba(18,18,30,0.97) 100%)`,
                  boxShadow: `0 4px 32px ${color}18, inset 0 1px 0 ${color}22`,
                }}>

                {/* ── Card header ── */}
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                    style={{ background: `${color}35`, boxShadow: `0 2px 12px ${color}40` }}>
                    {p.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>{p.name}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                        style={{ background: `${color}35`, color, border: `1px solid ${color}50` }}>
                        {PROJECT_TYPES.find((t) => t.value === p.type)?.label ?? p.type}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                        style={sold
                          ? { background: 'color-mix(in srgb, var(--color-green) 20%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 35%, transparent)' }
                          : { background: 'color-mix(in srgb, var(--color-amber) 18%, transparent)', color: 'var(--color-amber)', border: '1px solid color-mix(in srgb, var(--color-amber) 35%, transparent)' }}>
                        {sold ? '✓ Sold' : '● Active'}
                      </span>
                    </div>
                    {p.description && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{p.description}</p>
                    )}
                  </div>

                  {/* P&L strip */}
                  <div className="hidden sm:flex items-center gap-6 shrink-0">
                    <Stat label="Cost Basis" value={`$${p.costBasis.toFixed(2)}`} color="var(--color-text-secondary)" />
                    {sold && p.netGain != null ? (
                      <>
                        <Stat label="Sale Price" value={`$${Number(p.salePrice).toFixed(2)}`} color="var(--color-text-secondary)" />
                        <Stat label="Net Gain" value={`${p.netGain >= 0 ? '+' : ''}$${p.netGain.toFixed(2)}`} color={p.netGain >= 0 ? 'var(--color-green)' : 'var(--color-orange)'} />
                        {p.roi != null && <Stat label="ROI" value={`${p.roi >= 0 ? '+' : ''}${p.roi.toFixed(1)}%`} color={p.roi >= 0 ? 'var(--color-green)' : 'var(--color-orange)'} />}
                      </>
                    ) : (
                      <>
                        <Stat label="Invested" value={`$${p.costBasis.toFixed(2)}`} color="var(--color-text-secondary)" />
                        <Stat label="Income" value={`+$${p.income.toFixed(2)}`} color="#4FBF7F" />
                        <Stat label="Transactions" value={String(p.txCount)} color="var(--color-text-muted)" />
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!sold && (
                      <button onClick={() => { setShowSell(p); setSellForm({ salePrice: '', saleDate: new Date().toISOString().slice(0, 10) }); }}
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg hover:brightness-110"
                        style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' }}>
                        Mark Sold
                      </button>
                    )}
                    <button onClick={() => openEdit(p)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)]"
                      style={{ color: 'var(--color-text-muted)' }} title="Edit">
                      <EditIcon />
                    </button>
                    <button onClick={() => setConfirmDelete(p)} disabled={deleting === p.id}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/20"
                      title="Delete">
                      {deleting === p.id ? <span className="text-xs">…</span> : <TrashIcon />}
                    </button>
                    <button onClick={() => {
                      if (!isExpanded) loadDetail(p.id);
                      setExpandedId(isExpanded ? null : p.id);
                    }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-transform"
                      style={{ color: 'var(--color-text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                      <ChevronIcon />
                    </button>
                  </div>
                </div>

                {/* ── Expanded detail ── */}
                {isExpanded && (
                  <div className="border-t flex flex-col gap-5 px-5 py-4"
                    style={{ borderColor: `${color}20` }}>

                    {/* P&L breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Purchase Price', value: `$${Number(p.purchasePrice).toFixed(2)}`, color: 'var(--color-text-secondary)' },
                        { label: 'Expenses', value: `-$${p.expenses.toFixed(2)}`, color: 'var(--color-orange)' },
                        { label: 'Income During', value: `+$${p.income.toFixed(2)}`, color: 'var(--color-green)' },
                        sold && p.salePrice != null
                          ? { label: 'Sale Price', value: `$${Number(p.salePrice).toFixed(2)}`, color: 'var(--color-sky)' }
                          : { label: 'Cost Basis', value: `$${p.costBasis.toFixed(2)}`, color: 'var(--color-primary)' },
                      ].filter(Boolean).map((s: any) => (
                        <div key={s.label} className="p-3 rounded-xl"
                          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                          <p className="font-bold text-base mt-1" style={{ color: s.color }}>{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Net result banner */}
                    {sold && p.netGain != null && (
                      <div className="flex items-center justify-between px-4 py-3 rounded-xl"
                        style={{
                          background: p.netGain >= 0 ? 'color-mix(in srgb, var(--color-green) 10%, transparent)' : 'color-mix(in srgb, var(--color-orange) 10%, transparent)',
                          border: `1px solid ${p.netGain >= 0 ? 'color-mix(in srgb, var(--color-green) 25%, transparent)' : 'color-mix(in srgb, var(--color-orange) 25%, transparent)'}`,
                        }}>
                        <div>
                          <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Final Result</p>
                          <p className="font-bold text-xl mt-0.5" style={{ color: p.netGain >= 0 ? 'var(--color-green)' : 'var(--color-orange)' }}>
                            {p.netGain >= 0 ? '+' : ''}${p.netGain.toFixed(2)}
                          </p>
                        </div>
                        {p.roi != null && (
                          <div className="text-right">
                            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>ROI</p>
                            <p className="font-bold text-xl mt-0.5" style={{ color: p.netGain >= 0 ? 'var(--color-green)' : 'var(--color-orange)' }}>
                              {p.roi >= 0 ? '+' : ''}{p.roi.toFixed(1)}%
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Category breakdown ── */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => toggleCats(p.id)}
                          className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                          <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                            Expense Breakdown
                          </p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md"
                            style={{ background: `${color}15`, color, border: `1px solid ${color}25` }}>
                            {PROJECT_TYPES.find((t) => t.value === p.type)?.label ?? p.type} · {(p.categories ?? []).length}
                          </span>
                          <span className="text-[10px] transition-transform"
                            style={{ color: 'var(--color-text-muted)', display: 'inline-block', transform: collapsedCats[p.id] ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                            ▾
                          </span>
                        </button>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleSeedCats(p.id)}
                            disabled={seedingCat === p.id}
                            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg hover:brightness-110 disabled:opacity-50"
                            style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 28%, transparent)' }}>
                            {seedingCat === p.id ? '…' : '✦ Restore defaults'}
                          </button>
                          <button
                            onClick={() => { setShowCatForm(showCatForm === p.id ? null : p.id); setCatForm({ name: '', icon: '📦', color: '#9B6DFF' }); }}
                            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg hover:bg-[var(--color-elevated)]"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                            <PlusIcon /> Add
                          </button>
                        </div>
                      </div>

                      {/* Add category inline form */}
                      {!collapsedCats[p.id] && showCatForm === p.id && (
                        <form onSubmit={(e) => handleAddCat(e, p.id)}
                          className="flex items-center gap-2 p-2 rounded-xl"
                          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                          <input value={catForm.icon} onChange={(e) => setCatForm((f) => ({ ...f, icon: e.target.value }))}
                            className="w-9 px-1 py-1.5 text-center text-sm outline-none rounded-lg"
                            style={inputStyle} maxLength={2} placeholder="📦" />
                          <input required value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                            className="flex-1 px-2 py-1.5 text-xs outline-none rounded-lg" style={inputStyle}
                            placeholder="Category name…" />
                          <div className="flex items-center gap-1">
                            {PRESET_COLORS.map((c) => (
                              <button key={c} type="button" onClick={() => setCatForm((f) => ({ ...f, color: c }))}
                                className="w-4 h-4 rounded-full transition-transform hover:scale-110"
                                style={{ background: c, outline: catForm.color === c ? `2px solid ${c}` : 'none', outlineOffset: '1.5px' }} />
                            ))}
                          </div>
                          <button type="submit" disabled={savingCat}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg hover:brightness-110 disabled:opacity-50"
                            style={{ background: 'var(--color-card-violet)', color: 'white' }}>
                            {savingCat ? '…' : 'Add'}
                          </button>
                        </form>
                      )}

                      {!collapsedCats[p.id] && (
                        p.categories && p.categories.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {(p.categoryBreakdown ?? []).map((cat) => (
                              <div key={cat.id} className="flex items-center gap-2.5 p-2.5 rounded-xl group relative"
                                style={{ background: `${cat.color}10`, border: `1px solid ${cat.color}25` }}>
                                <span className="text-lg shrink-0">{cat.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate" style={{ color: cat.color }}>{cat.name}</p>
                                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                    {cat.txCount > 0 ? `$${cat.total.toFixed(2)} · ${cat.txCount} tx` : 'No transactions'}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleDeleteCat(p.id, cat.id)}
                                  disabled={deletingCat === cat.id}
                                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/20 transition-opacity shrink-0"
                                  title="Delete category">
                                  {deletingCat === cat.id ? <span className="text-[10px]">…</span> : <span className="text-[10px]" style={{ color: 'var(--color-rose)' }}>✕</span>}
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs py-2" style={{ color: 'var(--color-text-muted)' }}>
                            No categories yet — click "Restore defaults" to add pre-built ones, or add your own. Categories are shared across all {PROJECT_TYPES.find((t) => t.value === p.type)?.label ?? p.type} projects.
                          </p>
                        )
                      )}
                    </div>

                    {/* ── Linked transactions ── */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                          Linked Transactions ({p.txCount})
                        </p>
                        <button onClick={() => openLinkPicker(p.id)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg hover:brightness-110"
                          style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                          <PlusIcon /> Link Transaction
                        </button>
                      </div>

                      {p.transactions && p.transactions.length > 0 ? (
                        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                          {p.transactions.map((tx) => (
                            <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5"
                              style={{ borderTop: '1px solid var(--color-border)' }}>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{tx.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{tx.date}</span>
                                  {/* Project category badge with reassign picker */}
                                  <ProjectCategoryPicker
                                    tx={tx}
                                    categories={p.categories ?? []}
                                    projectId={p.id}
                                    onAssign={(catId) => reassignTxCategory(tx.id, p.id, catId)}
                                  />
                                </div>
                              </div>
                              <span className="text-sm font-semibold tabular-nums shrink-0"
                                style={{ color: Number(tx.amount) >= 0 ? 'var(--color-green)' : 'var(--color-orange)' }}>
                                {Number(tx.amount) >= 0 ? '+' : ''}${Math.abs(Number(tx.amount)).toFixed(2)}
                              </span>
                              <button onClick={() => doUnlink(tx, p.id)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/20"
                                title="Unlink" style={{ color: 'var(--color-text-muted)' }}>
                                <UnlinkIcon />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs py-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
                          No transactions linked yet — click "Link Transaction" to add them.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Create / Edit project modal ── */}
        {showForm && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}>
            <form onSubmit={handleSave}
              className="w-full max-w-md flex flex-col rounded-2xl overflow-hidden"
              style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>

              {/* Live preview header */}
              {(() => {
                const typeMeta = PROJECT_TYPES.find((t) => t.value === form.type)!;
                return (
                  <div className="flex items-center justify-between gap-3 px-5 py-4"
                    style={{ borderBottom: '1px solid var(--color-border)', background: `linear-gradient(135deg, ${form.color}10 0%, transparent 60%)` }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ background: `${form.color}22`, boxShadow: `0 0 0 1px ${form.color}44` }}>
                        {typeMeta.icon}
                      </div>
                      <div>
                        <p className="font-bold text-sm" style={{ color: form.name ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                          {form.name || (editing ? 'Edit Project' : 'New Project')}
                        </p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{ background: `${form.color}22`, color: form.color }}>
                          {typeMeta.label} · {typeMeta.hint}
                        </span>
                      </div>
                    </div>
                    <button type="button" onClick={closeForm}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0"
                      style={{ color: 'var(--color-text-muted)' }}>✕</button>
                  </div>
                );
              })()}

              <div className="flex flex-col gap-4 px-5 py-4">

                {/* Type selector */}
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Type</span>
                  <div className="grid grid-cols-4 gap-2">
                    {MAIN_TYPES.map((t) => {
                      const active = form.type === t.value || (t.value === 'business' && form.type === 'service');
                      return (
                        <button key={t.value} type="button"
                          onClick={() => setForm((f) => ({ ...f, type: t.value, icon: t.icon }))}
                          className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-all"
                          style={active
                            ? { background: `${form.color}20`, border: `1px solid ${form.color}55`, color: form.color, boxShadow: `0 0 12px ${form.color}20` }
                            : { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                          <span className="text-lg">{t.icon}</span>
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Business sub-type */}
                  {(form.type === 'business' || form.type === 'service') && (
                    <div className="flex gap-2 mt-1">
                      {BUSINESS_SUBTYPES.map((s) => (
                        <button key={s.value} type="button"
                          onClick={() => setForm((f) => ({ ...f, type: s.value }))}
                          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all"
                          style={form.type === s.value
                            ? { background: `${form.color}18`, border: `1px solid ${form.color}44`, color: form.color }
                            : { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                          <span className="text-base">{s.icon}</span>
                          <div className="text-left">
                            <p className="font-semibold leading-tight">{s.label}</p>
                            <p className="text-[10px] leading-tight opacity-70">{s.hint}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {!editing && (
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      Categories will be pre-filled based on type.
                    </p>
                  )}
                </div>

                {/* Name */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Name</span>
                  <input required autoFocus
                    placeholder={PROJECT_TYPES.find((t) => t.value === form.type)?.placeholder ?? 'Project name'}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="px-3 py-2.5 text-sm outline-none rounded-xl w-full" style={inputStyle} />
                </div>

                {/* Description + Purchase Price (hidden for service) */}
                <div className={`grid gap-3 ${form.type === 'service' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                      Description <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                    </span>
                    <input placeholder="Short note…" value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      className="px-3 py-2.5 text-sm outline-none rounded-xl" style={inputStyle} />
                  </div>
                  {form.type !== 'service' && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                        {form.type === 'property' ? 'Purchase Price' : form.type === 'vehicle' ? 'Purchase Price' : 'Initial Investment'}
                      </span>
                      <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                        <span className="flex items-center px-2.5 text-xs font-semibold shrink-0"
                          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)', borderRight: '1px solid var(--color-border)' }}>$</span>
                        <input type="number" step="0.01" min="0" placeholder="0.00" value={form.purchasePrice}
                          onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))}
                          className="flex-1 px-3 py-2.5 text-sm outline-none min-w-0"
                          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-primary)' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Date + Color */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                      {form.type === 'service' ? 'Start Date' : 'Purchase Date'}
                    </span>
                    <input type="date" value={form.purchaseDate}
                      onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                      className="px-3 py-2.5 text-sm outline-none rounded-xl w-full" style={{ ...inputStyle, colorScheme: 'dark' }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Color</span>
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl h-[42px]" style={inputStyle}>
                      {PRESET_COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                          className="w-4 h-4 rounded-full transition-all hover:scale-110 shrink-0"
                          style={{ background: c, boxShadow: form.color === c ? `0 0 0 2px rgba(0,0,0,0.6), 0 0 0 4px ${c}` : 'none' }} />
                      ))}
                    </div>
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="flex gap-2 justify-end px-5 py-4"
                style={{ borderTop: '1px solid var(--color-border)' }}>
                <button type="button" onClick={closeForm}
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
                  style={{ color: 'var(--color-text-secondary)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-60 transition-all"
                  style={{ background: form.color }}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

        {/* ── Mark as Sold modal ── */}
        {showSell && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSell(null); }}>
            <form onSubmit={handleSell}
              className="w-full max-w-lg flex flex-col gap-5 p-6 rounded-2xl"
              style={{ background: 'var(--color-surface)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', maxHeight: '90vh', overflowY: 'auto' }}>

              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ background: `${showSell.color}30` }}>{showSell.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base">{showSell.name}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Cost basis <span className="font-semibold text-white">${showSell.costBasis.toFixed(2)}</span>
                    <span className="opacity-50"> = ${Number(showSell.purchasePrice).toFixed(2)} purchase + ${showSell.expenses.toFixed(2)} expenses</span>
                  </p>
                </div>
                <button type="button" onClick={() => setShowSell(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0"
                  style={{ color: 'var(--color-text-muted)' }}>✕</button>
              </div>

              {/* Payment source tabs */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>How did you receive payment?</span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setSellMode('bank'); setSellLinkedTx(null); setSellForm(f => ({ ...f, salePrice: '' })); }}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                    style={sellMode === 'bank'
                      ? { background: 'color-mix(in srgb, var(--color-sky) 18%, transparent)', color: 'var(--color-sky)', border: '1px solid color-mix(in srgb, var(--color-sky) 40%, transparent)' }
                      : { background: 'var(--color-elevated)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                    <span className="text-xl">🏦</span>
                    <span>Bank Deposit</span>
                  </button>
                  <button type="button" onClick={() => { setSellMode('cash'); setSellLinkedTx(null); setSellForm(f => ({ ...f, salePrice: '' })); }}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                    style={sellMode === 'cash'
                      ? { background: 'color-mix(in srgb, var(--color-green) 18%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 40%, transparent)' }
                      : { background: 'var(--color-elevated)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                    <span className="text-xl">💵</span>
                    <span>Cash</span>
                  </button>
                </div>
              </div>

              {/* Bank deposit: transaction picker */}
              {sellMode === 'bank' && (
                <div className="flex flex-col gap-2">
                  {sellLinkedTx ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: 'color-mix(in srgb, var(--color-sky) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-sky) 30%, transparent)' }}>
                      <span className="text-xl shrink-0">🏦</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{sellLinkedTx.name}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {sellLinkedTx.date} · {sellLinkedTx.bankAccount?.bankName}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: 'var(--color-sky)' }}>
                        +${Number(sellLinkedTx.amount).toFixed(2)}
                      </span>
                      <button type="button" onClick={() => { setSellLinkedTx(null); setSellForm(f => ({ ...f, salePrice: '' })); }}
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0 text-xs"
                        style={{ color: 'var(--color-text-muted)' }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <input placeholder="Search checking / savings deposits…" value={sellTxSearch}
                        onChange={(e) => setSellTxSearch(e.target.value)}
                        className="px-3 py-2.5 text-sm outline-none" style={inputStyle} autoFocus />
                      <div className="overflow-y-auto flex flex-col gap-0.5 max-h-48 -mx-1 px-1">
                        {sellLoadingTx ? (
                          <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
                        ) : filteredSellTx.length === 0 ? (
                          <div className="py-4 text-center">
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No deposits found in checking / savings.</p>
                            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>Switch to "Cash" if you received cash.</p>
                          </div>
                        ) : filteredSellTx.map((tx) => (
                          <button key={tx.id} type="button"
                            onClick={() => { setSellLinkedTx(tx); setSellForm(f => ({ ...f, salePrice: String(Number(tx.amount).toFixed(2)), saleDate: tx.date })); }}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/5 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{tx.name}</p>
                              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                {tx.date} · {tx.bankAccount?.bankName} · {tx.bankAccount?.accountName}
                              </p>
                            </div>
                            <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: 'var(--color-green)' }}>
                              +${Number(tx.amount).toFixed(2)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Cash: pick from cash account transactions */}
              {sellMode === 'cash' && (
                <div className="flex flex-col gap-2">
                  {sellLinkedTx ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: 'color-mix(in srgb, var(--color-green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)' }}>
                      <span className="text-xl shrink-0">💵</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{sellLinkedTx.name}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {sellLinkedTx.date} · {sellLinkedTx.bankAccount?.bankName ?? 'Cash'}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: 'var(--color-green)' }}>
                        +${Number(sellLinkedTx.amount).toFixed(2)}
                      </span>
                      <button type="button" onClick={() => { setSellLinkedTx(null); setSellForm(f => ({ ...f, salePrice: '' })); }}
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0 text-xs"
                        style={{ color: 'var(--color-text-muted)' }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div className="px-3 py-2.5 rounded-xl text-xs flex items-start gap-2"
                        style={{ background: 'color-mix(in srgb, var(--color-amber) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--color-amber) 20%, transparent)', color: 'color-mix(in srgb, var(--color-amber) 90%, transparent)' }}>
                        <span className="shrink-0">💡</span>
                        <span>Record the cash receipt in <strong>Transactions → + Add</strong> first, then come back to link it here.</span>
                      </div>
                      <input placeholder="Search cash transactions…" value={sellTxSearch}
                        onChange={(e) => setSellTxSearch(e.target.value)}
                        className="px-3 py-2.5 text-sm outline-none" style={inputStyle} autoFocus />
                      <div className="overflow-y-auto flex flex-col gap-0.5 max-h-48 -mx-1 px-1">
                        {sellLoadingTx ? (
                          <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
                        ) : filteredSellTx.length === 0 ? (
                          <div className="py-4 text-center">
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No cash transactions found.</p>
                            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>Add one in Transactions first, then return here.</p>
                          </div>
                        ) : filteredSellTx.map((tx) => (
                          <button key={tx.id} type="button"
                            onClick={() => { setSellLinkedTx(tx); setSellForm(f => ({ ...f, salePrice: String(Number(tx.amount).toFixed(2)), saleDate: tx.date })); }}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/5 transition-colors">
                            <span className="text-lg shrink-0">💵</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{tx.name}</p>
                              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                {tx.date} · {tx.bankAccount?.bankName ?? 'Cash'} · {tx.bankAccount?.accountName}
                              </p>
                            </div>
                            <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: 'var(--color-green)' }}>
                              +${Number(tx.amount).toFixed(2)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Sale date */}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Sale Date</span>
                <input type="date" value={sellForm.saleDate}
                  onChange={(e) => setSellForm((f) => ({ ...f, saleDate: e.target.value }))}
                  className="px-3 py-2.5 text-sm outline-none" style={{ ...inputStyle, colorScheme: 'dark' }} />
              </label>

              {/* P&L preview */}
              {sellForm.salePrice && (
                <div className="p-4 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                  {(() => {
                    const sale = parseFloat(sellForm.salePrice) || 0;
                    const net  = sale - showSell.costBasis + showSell.income;
                    const roi  = showSell.costBasis > 0 ? (net / showSell.costBasis) * 100 : 0;
                    const gain = net >= 0;
                    return (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Estimated Net Gain</p>
                          <p className="font-bold text-xl mt-0.5" style={{ color: gain ? 'var(--color-green)' : 'var(--color-orange)' }}>
                            {gain ? '+' : ''}${net.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>ROI</p>
                          <p className="font-bold text-xl mt-0.5" style={{ color: gain ? 'var(--color-green)' : 'var(--color-orange)' }}>
                            {gain ? '+' : ''}{roi.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowSell(null)}
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)]"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={selling || (!sellForm.salePrice && !sellLinkedTx)}
                  className="px-5 py-2 text-sm font-semibold rounded-xl hover:brightness-110 disabled:opacity-50"
                  style={{ background: 'color-mix(in srgb, var(--color-green) 20%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 35%, transparent)' }}>
                  {selling ? 'Saving…' : '✓ Confirm Sale'}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

        {/* ── Link Transaction picker ── */}
        {showLinkPicker && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowLinkPicker(null); setPendingLinkTx(null); } }}>
            <div className="w-full max-w-lg flex flex-col gap-4 p-6 rounded-2xl"
              style={{ background: 'var(--color-surface)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', maxHeight: '80vh' }}>

              {!pendingLinkTx ? (
                /* ── Step 1: pick transaction ── */
                <>
                  <div className="flex items-center justify-between shrink-0">
                    <p className="font-bold text-base">Link Transactions</p>
                    <button onClick={() => setShowLinkPicker(null)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)]"
                      style={{ color: 'var(--color-text-muted)' }}>✕</button>
                  </div>

                  <input placeholder="Search transactions…" value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    className="px-3 py-2.5 text-sm outline-none shrink-0" style={inputStyle} autoFocus />

                  <div className="overflow-y-auto flex flex-col gap-1 -mx-1 px-1">
                    {filtered.slice(0, 100).map((tx) => {
                      const linked      = tx.projectId === showLinkPicker;
                      const otherProject = tx.projectId && tx.projectId !== showLinkPicker;
                      return (
                        <button key={tx.id}
                          onClick={() => !otherProject && selectTxForLink(tx, showLinkPicker!)}
                          disabled={linking || !!otherProject}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5 disabled:opacity-40"
                          style={linked ? { background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)' } : {}}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{tx.name}</p>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                              {tx.date}{otherProject ? ' · linked to another project' : ''}
                              {linked && tx.projectCategoryId && (() => {
                                const cat = projects.find((p) => p.id === showLinkPicker)?.categories?.find((c) => c.id === tx.projectCategoryId);
                                return cat ? ` · ${cat.icon} ${cat.name}` : '';
                              })()}
                            </p>
                          </div>
                          <span className="text-sm font-semibold tabular-nums shrink-0"
                            style={{ color: Number(tx.amount) >= 0 ? 'var(--color-green)' : 'var(--color-orange)' }}>
                            {Number(tx.amount) >= 0 ? '+' : ''}${Math.abs(Number(tx.amount)).toFixed(2)}
                          </span>
                          <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                            style={linked
                              ? { background: 'var(--color-primary)', color: 'white' }
                              : { border: '1.5px solid var(--color-border)' }}>
                            {linked && <span className="text-xs">✓</span>}
                          </div>
                        </button>
                      );
                    })}
                    {filtered.length === 0 && (
                      <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-muted)' }}>No transactions found</p>
                    )}
                  </div>

                  <div className="shrink-0 pt-1">
                    <button onClick={() => { setShowLinkPicker(null); setPendingLinkTx(null); }}
                      className="w-full py-2.5 text-sm font-semibold rounded-xl hover:brightness-110"
                      style={{ background: 'var(--color-card-violet)', color: 'white' }}>
                      Done
                    </button>
                  </div>
                </>
              ) : (
                /* ── Step 2: pick project category ── */
                <>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => setPendingLinkTx(null)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] text-lg"
                      style={{ color: 'var(--color-text-muted)' }}>←</button>
                    <p className="font-bold text-base flex-1">Categorize for this project</p>
                    <button onClick={() => { setShowLinkPicker(null); setPendingLinkTx(null); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)]"
                      style={{ color: 'var(--color-text-muted)' }}>✕</button>
                  </div>

                  {/* Transaction summary */}
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl shrink-0"
                    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{pendingLinkTx.name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{pendingLinkTx.date}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums"
                      style={{ color: Number(pendingLinkTx.amount) >= 0 ? 'var(--color-green)' : 'var(--color-orange)' }}>
                      {Number(pendingLinkTx.amount) >= 0 ? '+' : ''}${Math.abs(Number(pendingLinkTx.amount)).toFixed(2)}
                    </span>
                  </div>

                  <p className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                    Select a project category to tag this expense (optional):
                  </p>

                  {(() => {
                    const isIncome = Number(pendingLinkTx?.amount ?? 0) >= 0;
                    const allCats  = projects.find((p) => p.id === showLinkPicker)?.categories ?? [];
                    const primary  = allCats.filter((c) => isIncome ? c.type === 'income' : c.type === 'expense');
                    const refund   = allCats.filter((c) => isIncome ? c.type === 'expense' : c.type === 'income');
                    const CatBtn = (cat: ProjectCategory) => (
                      <button key={cat.id}
                        onClick={() => setPendingCatId(cat.id)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5"
                        style={pendingCatId === cat.id
                          ? { background: `${cat.color}18`, border: `1px solid ${cat.color}40` }
                          : { border: '1px solid var(--color-border)' }}>
                        <span className="text-lg shrink-0">{cat.icon}</span>
                        <span className="text-xs font-medium truncate" style={{ color: pendingCatId === cat.id ? cat.color : 'var(--color-text-secondary)' }}>
                          {cat.name}
                        </span>
                        {pendingCatId === cat.id && <span className="ml-auto text-xs shrink-0" style={{ color: cat.color }}>✓</span>}
                      </button>
                    );
                    return (
                      <div className="overflow-y-auto flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setPendingCatId('')}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5"
                            style={pendingCatId === ''
                              ? { background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)' }
                              : { border: '1px solid var(--color-border)' }}>
                            <span className="text-lg">🏷️</span>
                            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>No category</span>
                          </button>
                          {primary.map(CatBtn)}
                        </div>
                        {refund.length > 0 && (
                          <>
                            <p className="text-[10px] font-bold tracking-widest uppercase px-1 pt-1"
                              style={{ color: 'var(--color-text-muted)' }}>
                              {isIncome ? '↩ Return / Refund' : '↩ Adjustment'}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {refund.map(CatBtn)}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex gap-2 justify-end shrink-0 pt-1">
                    <button onClick={() => setPendingLinkTx(null)}
                      className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)]"
                      style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                      Back
                    </button>
                    <button onClick={() => confirmLink(showLinkPicker!)} disabled={linking}
                      className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-60"
                      style={{ background: 'var(--color-card-violet)' }}>
                      {linking ? 'Linking…' : 'Link Transaction'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

        {/* ── Delete confirmation modal ── */}
        {confirmDelete && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
            <div className="w-full max-w-sm flex flex-col gap-5 p-6 rounded-2xl"
              style={{ background: 'var(--color-surface)', border: '1px solid color-mix(in srgb, var(--color-rose) 20%, transparent)', boxShadow: 'var(--glass-shadow)' }}>

              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--color-rose) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 22%, transparent)' }}>
                  🗑️
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base">Delete "{confirmDelete.name}"?</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    This will permanently delete the project. All{' '}
                    <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                      {confirmDelete.txCount} linked transaction{confirmDelete.txCount !== 1 ? 's' : ''}
                    </span>{' '}
                    will be unlinked and left uncategorized from this project.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl text-xs flex items-start gap-2"
                style={{ background: 'color-mix(in srgb, var(--color-rose) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 18%, transparent)', color: 'rgba(255,180,180,0.85)' }}>
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>This action cannot be undone.</span>
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)]"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  Cancel
                </button>
                <button onClick={() => handleDelete(confirmDelete)} disabled={deleting === confirmDelete.id}
                  className="px-5 py-2 text-sm font-semibold rounded-xl hover:brightness-110 disabled:opacity-60"
                  style={{ background: 'color-mix(in srgb, var(--color-rose) 20%, transparent)', color: 'var(--color-rose)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)' }}>
                  {deleting === confirmDelete.id ? 'Deleting…' : 'Delete Project'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      </main>
    </div>
  );
}

/* ── Inline project-category reassign picker ── */
function ProjectCategoryPicker({
  tx, categories, projectId, onAssign,
}: {
  tx: Transaction;
  categories: ProjectCategory[];
  projectId: string;
  onAssign: (catId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = categories.find((c) => c.id === tx.projectCategoryId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md hover:brightness-125 transition-all"
        style={current
          ? { background: `${current.color}18`, border: `1px solid ${current.color}35`, color: current.color }
          : { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
        {current ? <><span>{current.icon}</span><span>{current.name}</span></> : <span>+ Tag</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 rounded-xl overflow-hidden min-w-36"
          style={{ background: 'var(--popover-bg)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
          {current && (
            <button
              onClick={() => { onAssign(null); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--color-elevated)] text-left"
              style={{ color: 'var(--color-rose)' }}>
              <span>✕</span><span>Remove tag</span>
            </button>
          )}
          {(() => {
            const isIncome = Number(tx.amount) >= 0;
            const primary  = categories.filter((c) => isIncome ? c.type === 'income' : c.type === 'expense');
            const refund   = categories.filter((c) => isIncome ? c.type === 'expense' : c.type === 'income');
            const CatBtn = (cat: ProjectCategory) => (
              <button key={cat.id}
                onClick={() => { onAssign(cat.id); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--color-elevated)] text-left"
                style={tx.projectCategoryId === cat.id ? { background: `${cat.color}15` } : {}}>
                <span>{cat.icon}</span>
                <span style={{ color: tx.projectCategoryId === cat.id ? cat.color : 'var(--color-text-secondary)' }}>{cat.name}</span>
                {tx.projectCategoryId === cat.id && <span className="ml-auto" style={{ color: cat.color }}>✓</span>}
              </button>
            );
            return (
              <>
                {primary.map(CatBtn)}
                {refund.length > 0 && (
                  <>
                    <div className="px-3 pt-1 pb-0.5 text-[9px] font-bold tracking-widest uppercase"
                      style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
                      {isIncome ? '↩ Return / Refund' : '↩ Adjustment'}
                    </div>
                    {refund.map(CatBtn)}
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-sm font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function PlusIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function EditIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function TrashIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
}
function ChevronIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
}
function UnlinkIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="2" y1="2" x2="22" y2="22"/></svg>;
}
