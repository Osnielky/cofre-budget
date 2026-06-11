'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import Sidebar from '@/components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const PRESET_COLORS = ['#818CF8', '#22C55E', '#F97316', '#F5C842', '#38BDF8', '#F43F5E', '#E879A0'];

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
  imageUrl?: string | null;
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
  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: '10px', color: 'var(--color-text-primary)',
};

function focusInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.border = '1px solid rgba(245,200,66,0.55)';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,200,66,0.12)';
}
function blurInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.13)';
  e.currentTarget.style.boxShadow = 'none';
}

export default function ProjectsPage() {
  const [projects, setProjects]     = useState<Project[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const emptyForm = { name: '', type: 'vehicle', icon: '🚗', color: PRESET_COLORS[0], description: '', purchasePrice: '', purchaseDate: '', imageUrl: '' };
  const [form, setForm] = useState(emptyForm);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      const res  = await fetch(`${API}/projects`, { credentials: 'include' });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setProjects(list);
      if (list.length > 0) {
        setSelectedId((prev) => prev ?? list[0].id);
        loadDetail(list[0].id);
      }
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
      setSelectedId(saved.id);
      loadDetail(saved.id);
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
      setProjects((prev) => {
        const remaining = prev.filter((p) => p.id !== project.id);
        if (selectedId === project.id) {
          const next = remaining[0] ?? null;
          setSelectedId(next?.id ?? null);
          if (next) loadDetail(next.id);
        }
        return remaining;
      });
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
    setForm({ name: p.name, type: p.type, icon: p.icon, color: p.color, description: p.description ?? '', purchasePrice: String(p.purchasePrice), purchaseDate: p.purchaseDate ?? '', imageUrl: p.imageUrl ?? '' });
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
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-4 flex items-center justify-between gap-3 z-20"
          style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects &amp; Assets</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Track cost basis and P&amp;L — cars, property, businesses.
            </p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110"
            style={{ background: 'var(--color-card-violet)' }}>
            <PlusIcon /> New Project
          </button>
        </div>

        {/* ── Two-column body ── */}
        <div className="flex flex-1 min-h-0">

          {/* ── Left: project list ── */}
          <div className="w-96 shrink-0 overflow-y-auto flex flex-col gap-1.5 p-3"
            style={{ borderRight: '1px solid var(--color-border)' }}>

            {loading && <p className="text-xs p-2" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}

            {!loading && projects.length === 0 && (
              <div className="flex flex-col items-center gap-3 text-center py-12 px-4">
                <span className="text-5xl opacity-25">📦</span>
                <p className="font-semibold text-sm">No projects yet</p>
                <button onClick={openCreate}
                  className="mt-1 px-4 py-2 text-xs font-semibold text-white rounded-xl hover:brightness-110"
                  style={{ background: 'var(--color-card-violet)' }}>
                  Create first project
                </button>
              </div>
            )}

            {projects.map((p) => {
              const color      = p.color || '#9B6DFF';
              const sold       = p.status === 'sold';
              const isSelected = selectedId === p.id;
              return (
                <button key={p.id}
                  onClick={() => { setSelectedId(p.id); if (!p.transactions) loadDetail(p.id); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-150"
                  style={{
                    cursor: 'pointer',
                    background: isSelected
                      ? `linear-gradient(135deg, ${color}22 0%, ${color}0a 100%)`
                      : 'rgba(255,255,255,0.03)',
                    border: isSelected ? `1px solid ${color}55` : '1px solid rgba(255,255,255,0.07)',
                    boxShadow: isSelected ? `0 2px 16px ${color}15` : 'none',
                  }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 overflow-hidden"
                    style={{ background: `${color}25`, border: `1px solid ${color}35` }}>
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                      : p.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate text-white">{p.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ background: `${color}20`, color, border: `1px solid ${color}35` }}>
                        {PROJECT_TYPES.find((t) => t.value === p.type)?.label ?? p.type}
                      </span>
                      <span className="text-[10px] font-semibold"
                        style={{ color: sold ? '#4FBF7F' : 'rgba(245,200,66,0.75)' }}>
                        {sold ? '✓ Sold' : '● Active'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold tabular-nums"
                      style={{ color: sold && p.netGain != null ? (p.netGain >= 0 ? '#4FBF7F' : '#F07A3E') : 'var(--color-text-secondary)' }}>
                      {sold && p.netGain != null
                        ? `${p.netGain >= 0 ? '+' : ''}$${Math.abs(p.netGain).toFixed(0)}`
                        : `$${p.costBasis.toFixed(0)}`}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      {sold && p.netGain != null ? 'net gain' : 'cost basis'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Right: detail panel ── */}
          <div className="flex-1 overflow-y-auto">
            {(() => {
              const sel = selectedId ? projects.find((p) => p.id === selectedId) : null;
              if (!sel) return (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                    style={{ background: 'rgba(155,109,255,0.10)', border: '1px solid rgba(155,109,255,0.20)' }}>📊</div>
                  <p className="font-semibold">Select a project</p>
                  <p className="text-sm max-w-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Click any project on the left to see its P&amp;L, categories, and linked transactions.
                  </p>
                </div>
              );

              const color = sel.color || '#9B6DFF';
              const sold  = sel.status === 'sold';

              return (
                <div className="flex flex-col">

                  {/* ── Compact header ── */}
                  <div className="flex items-center gap-4 px-5 py-4 shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${color}18 0%, transparent 70%)`,
                      borderBottom: '1px solid rgba(255,255,255,0.07)',
                    }}>
                    {/* Image / icon box */}
                    <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center text-4xl"
                      style={{
                        background: sel.imageUrl ? undefined : `${color}25`,
                        border: `1px solid ${color}45`,
                        boxShadow: `0 4px 20px ${color}30`,
                      }}>
                      {sel.imageUrl
                        ? <img src={sel.imageUrl} alt={sel.name} className="w-full h-full object-cover" />
                        : sel.icon}
                    </div>
                    {/* Name + badges */}
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold text-xl text-white leading-tight">{sel.name}</h2>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                          style={{ background: `${color}25`, color, border: `1px solid ${color}45` }}>
                          {PROJECT_TYPES.find((t) => t.value === sel.type)?.label ?? sel.type}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                          style={sold
                            ? { background: 'rgba(79,191,127,0.20)', color: '#4FBF7F', border: '1px solid rgba(79,191,127,0.40)' }
                            : { background: 'rgba(245,200,66,0.18)', color: '#F5C842', border: '1px solid rgba(245,200,66,0.40)' }}>
                          {sold ? '✓ Sold' : '● Active'}
                        </span>
                      </div>
                      {sel.description && (
                        <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>{sel.description}</p>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!sold && (
                        <button onClick={() => { setShowSell(sel); setSellForm({ salePrice: '', saleDate: new Date().toISOString().slice(0, 10) }); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl hover:brightness-110"
                          style={{ background: 'rgba(79,191,127,0.18)', color: '#4FBF7F', border: '1px solid rgba(79,191,127,0.38)' }}>
                          Mark Sold
                        </button>
                      )}
                      <button onClick={() => openEdit(sel)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/10"
                        style={{ color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.10)' }}>
                        <EditIcon />
                      </button>
                      <button onClick={() => setConfirmDelete(sel)} disabled={deleting === sel.id}
                        className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-red-500/20"
                        style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                        {deleting === sel.id ? <span className="text-xs">…</span> : <TrashIcon />}
                      </button>
                    </div>
                  </div>

                  {/* ── Body ── */}
                  <div className="flex flex-col gap-5 px-5 py-4">

                    {/* P&L breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Purchase Price', value: `$${Number(sel.purchasePrice).toFixed(2)}`, clr: 'var(--color-text-secondary)' },
                        { label: 'Expenses',       value: `-$${sel.expenses.toFixed(2)}`,             clr: '#F07A3E' },
                        { label: 'Income',         value: `+$${sel.income.toFixed(2)}`,               clr: '#4FBF7F' },
                        sold && sel.salePrice != null
                          ? { label: 'Sale Price', value: `$${Number(sel.salePrice).toFixed(2)}`,     clr: '#4BA8D8' }
                          : { label: 'Cost Basis', value: `$${sel.costBasis.toFixed(2)}`,             clr: '#9B6DFF' },
                      ].filter(Boolean).map((s: any) => (
                        <div key={s.label} className="p-3 rounded-xl"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                          <p className="font-bold text-base mt-1" style={{ color: s.clr }}>{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* ── Charts ── */}
                    {(() => {
                      const isBusiness = sel.type === 'business' || sel.type === 'service';

                      /* Build cumulative lines from all transactions */
                      const allTxsSorted = [...(sel.transactions ?? [])]
                        .sort((a, b) => a.date.localeCompare(b.date));

                      const lineData: { date: string; expenses: number; income: number }[] = [];
                      if (sel.purchaseDate) lineData.push({ date: sel.purchaseDate, expenses: 0, income: 0 });
                      let cumExp = 0, cumInc = 0;
                      for (const tx of allTxsSorted) {
                        const a = Number(tx.amount);
                        if (a < 0) cumExp += Math.abs(a); else cumInc += a;
                        lineData.push({ date: tx.date, expenses: cumExp, income: cumInc });
                      }
                      if (sold && sel.saleDate && !lineData.some(d => d.date === sel.saleDate)) {
                        lineData.push({ date: sel.saleDate, expenses: cumExp, income: cumInc });
                      }
                      lineData.sort((a, b) => a.date.localeCompare(b.date));

                      const fmtDate = (d: string) => {
                        const [y, m, day] = d.split('-');
                        return `${m}/${day}/${y.slice(2)}`;
                      };

                      /* Category totals */
                      const catData = (sel.categoryBreakdown ?? []).filter(c => c.total > 0)
                        .sort((a, b) => b.total - a.total).slice(0, 7);
                      const catMax  = catData[0]?.total ?? 1;

                      const chartBg  = 'rgba(255,255,255,0.03)';
                      const chartBdr = '1px solid rgba(255,255,255,0.07)';

                      const LineTip = ({ active, payload }: any) => active && payload?.length ? (
                        <div className="px-3 py-2 rounded-xl text-xs"
                          style={{ background: 'rgba(6,12,38,0.97)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                          <p className="font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{fmtDate(payload[0].payload.date)}</p>
                          {payload.map((p: any) => (
                            <p key={p.dataKey} className="font-bold" style={{ color: p.color }}>
                              {p.dataKey === 'income' ? '+' : '-'}${Number(p.value).toFixed(2)} {p.dataKey}
                            </p>
                          ))}
                        </div>
                      ) : null;

                      const chartTitle    = isBusiness ? 'Revenue vs Expenses' : 'Expenses Over Time';
                      const chartSubtitle = isBusiness ? 'Cumulative income & costs' : 'Cumulative since purchase';
                      const hasData       = lineData.length >= 2;

                      return (
                        <div className="grid grid-cols-2 gap-4">

                          {/* Chart 1 */}
                          <div className="rounded-2xl p-4 flex flex-col gap-3"
                            style={{ background: chartBg, border: chartBdr }}>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>{chartTitle}</p>
                                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{chartSubtitle}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {isBusiness && (
                                  <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                                    <span className="w-5 h-0.5 inline-block rounded" style={{ background: '#4FBF7F' }} /> Income
                                  </span>
                                )}
                                <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                                  <span className="w-5 h-0.5 inline-block rounded" style={{ background: '#F07A3E' }} /> Expenses
                                </span>
                                {sold && sel.saleDate && (
                                  <span className="text-[10px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-md"
                                    style={{ background: 'rgba(79,191,127,0.15)', color: '#4FBF7F', border: '1px solid rgba(79,191,127,0.30)' }}>
                                    <span className="w-1 h-3 rounded-sm inline-block" style={{ background: '#4FBF7F' }} /> Sold
                                  </span>
                                )}
                              </div>
                            </div>
                            {!hasData ? (
                              <p className="text-xs text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
                                Link transactions to see the trend
                              </p>
                            ) : (
                              <ResponsiveContainer width="100%" height={130}>
                                <AreaChart data={lineData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                                  <defs>
                                    <linearGradient id={`expGrad-${sel.id}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%"  stopColor="#F07A3E" stopOpacity={0.30} />
                                      <stop offset="95%" stopColor="#F07A3E" stopOpacity={0.02} />
                                    </linearGradient>
                                    <linearGradient id={`incGrad-${sel.id}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%"  stopColor="#4FBF7F" stopOpacity={0.30} />
                                      <stop offset="95%" stopColor="#4FBF7F" stopOpacity={0.02} />
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5).replace('-', '/')}
                                    tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.30)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                  <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.22)' }} axisLine={false} tickLine={false} />
                                  <Tooltip content={<LineTip />} cursor={{ stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1 }} />
                                  <Area type="monotone" dataKey="expenses" stroke="#F07A3E" strokeWidth={2}
                                    fill={`url(#expGrad-${sel.id})`} dot={false} activeDot={{ r: 4, fill: '#F07A3E', strokeWidth: 0 }} />
                                  {isBusiness && (
                                    <Area type="monotone" dataKey="income" stroke="#4FBF7F" strokeWidth={2}
                                      fill={`url(#incGrad-${sel.id})`} dot={false} activeDot={{ r: 4, fill: '#4FBF7F', strokeWidth: 0 }} />
                                  )}
                                  {sold && sel.saleDate && (
                                    <ReferenceLine x={sel.saleDate} stroke="#4FBF7F" strokeWidth={2} strokeDasharray="5 3"
                                      label={{ value: '$ Sold', position: 'insideTopRight', fill: '#4FBF7F', fontSize: 9, fontWeight: 700 }} />
                                  )}
                                </AreaChart>
                              </ResponsiveContainer>
                            )}
                          </div>

                          {/* Chart 2 — Spending by category */}
                          <div className="rounded-2xl p-4 flex flex-col gap-3"
                            style={{ background: chartBg, border: chartBdr }}>
                            <p className="text-xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>Spending by Category</p>
                            {catData.length === 0 ? (
                              <p className="text-xs text-center py-8" style={{ color: 'var(--color-text-muted)' }}>No categorised spend yet</p>
                            ) : (
                              <div className="flex flex-col gap-2.5 justify-center h-full">
                                {catData.map((cat) => (
                                  <div key={cat.id} className="flex items-center gap-2">
                                    <span className="text-sm shrink-0 w-5 text-center">{cat.icon}</span>
                                    <div className="flex-1 flex flex-col gap-0.5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-semibold truncate" style={{ color: cat.color }}>{cat.name}</span>
                                        <span className="text-[10px] tabular-nums font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>${cat.total.toFixed(2)}</span>
                                      </div>
                                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                                        <div className="h-full rounded-full transition-all duration-700"
                                          style={{ width: `${(cat.total / catMax) * 100}%`, background: `linear-gradient(90deg, ${cat.color}, ${cat.color}66)` }} />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                        </div>
                      );
                    })()}

                    {/* Net result banner */}
                    {sold && sel.netGain != null && (
                      <div className="flex items-center justify-between px-4 py-3 rounded-xl"
                        style={{
                          background: sel.netGain >= 0 ? 'rgba(79,191,127,0.10)' : 'rgba(240,122,62,0.10)',
                          border: `1px solid ${sel.netGain >= 0 ? 'rgba(79,191,127,0.25)' : 'rgba(240,122,62,0.25)'}`,
                        }}>
                        <div>
                          <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Final Result</p>
                          <p className="font-bold text-2xl mt-0.5" style={{ color: sel.netGain >= 0 ? '#4FBF7F' : '#F07A3E' }}>
                            {sel.netGain >= 0 ? '+' : ''}${sel.netGain.toFixed(2)}
                          </p>
                        </div>
                        {sel.roi != null && (
                          <div className="text-right">
                            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>ROI</p>
                            <p className="font-bold text-2xl mt-0.5" style={{ color: sel.netGain >= 0 ? '#4FBF7F' : '#F07A3E' }}>
                              {sel.roi >= 0 ? '+' : ''}{sel.roi.toFixed(1)}%
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Category breakdown ── */}
                    <div className="flex flex-col gap-2">
                      {/* Toggle bar */}
                      <div className="flex items-center gap-2 rounded-xl overflow-hidden"
                        style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                        <button onClick={() => toggleCats(sel.id)}
                          className="flex-1 flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
                          style={{ cursor: 'pointer' }}>
                          <span className="flex items-center justify-center w-5 h-5 rounded-md transition-transform duration-200"
                            style={{
                              background: collapsedCats[sel.id] ? 'rgba(255,255,255,0.07)' : `${color}20`,
                              transform: collapsedCats[sel.id] ? 'rotate(-90deg)' : 'rotate(0deg)',
                              color: collapsedCats[sel.id] ? 'var(--color-text-muted)' : color,
                            }}>
                            <ChevronIcon />
                          </span>
                          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Expense Breakdown</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{ background: `${color}15`, color, border: `1px solid ${color}25` }}>
                            {(sel.categories ?? []).length}
                          </span>
                          <span className="text-[10px] ml-auto pr-1" style={{ color: 'var(--color-text-muted)' }}>
                            {collapsedCats[sel.id] ? 'show' : 'hide'}
                          </span>
                        </button>
                        <div className="flex items-center gap-1 px-2 shrink-0"
                          style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                          <button onClick={() => handleSeedCats(sel.id)} disabled={seedingCat === sel.id}
                            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg hover:brightness-110 disabled:opacity-50 whitespace-nowrap"
                            style={{ background: 'rgba(155,109,255,0.15)', color: '#9B6DFF', border: '1px solid rgba(155,109,255,0.28)' }}>
                            {seedingCat === sel.id ? '…' : '✦ Restore'}
                          </button>
                          <button onClick={() => { setShowCatForm(showCatForm === sel.id ? null : sel.id); setCatForm({ name: '', icon: '📦', color: '#9B6DFF' }); }}
                            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg hover:bg-white/10 whitespace-nowrap"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <PlusIcon /> Add
                          </button>
                        </div>
                      </div>

                      {!collapsedCats[sel.id] && showCatForm === sel.id && (
                        <form onSubmit={(e) => handleAddCat(e, sel.id)}
                          className="flex items-center gap-2 p-2 rounded-xl"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                          <input value={catForm.icon} onChange={(e) => setCatForm((f) => ({ ...f, icon: e.target.value }))}
                            className="w-9 px-1 py-1.5 text-center text-sm outline-none rounded-lg"
                            style={inputStyle} maxLength={2} placeholder="📦" />
                          <input required value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                            className="flex-1 px-2 py-1.5 text-xs outline-none rounded-lg" style={inputStyle} placeholder="Category name…" />
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

                      {!collapsedCats[sel.id] && (
                        sel.categories && sel.categories.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {(sel.categoryBreakdown ?? []).map((cat) => (
                              <div key={cat.id} className="flex items-center gap-2.5 p-2.5 rounded-xl group relative"
                                style={{ background: `${cat.color}10`, border: `1px solid ${cat.color}25` }}>
                                <span className="text-lg shrink-0">{cat.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate" style={{ color: cat.color }}>{cat.name}</p>
                                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                    {cat.txCount > 0 ? `$${cat.total.toFixed(2)} · ${cat.txCount} tx` : 'No transactions'}
                                  </p>
                                </div>
                                <button onClick={() => handleDeleteCat(sel.id, cat.id)} disabled={deletingCat === cat.id}
                                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/20 transition-opacity shrink-0">
                                  {deletingCat === cat.id ? <span className="text-[10px]">…</span> : <span className="text-[10px]" style={{ color: '#FF6B6B' }}>✕</span>}
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs py-2" style={{ color: 'var(--color-text-muted)' }}>
                            No categories yet — click "Restore defaults" to add pre-built ones, or add your own.
                          </p>
                        )
                      )}
                    </div>

                    {/* ── Linked transactions ── */}
                    <div className="flex flex-col gap-2 pb-6">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                          Linked Transactions ({sel.txCount})
                        </p>
                        <button onClick={() => openLinkPicker(sel.id)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg hover:brightness-110"
                          style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                          <PlusIcon /> Link Transaction
                        </button>
                      </div>

                      {sel.transactions && sel.transactions.length > 0 ? (
                        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                          {sel.transactions.map((tx) => (
                            <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5"
                              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                              <div className="w-1.5 self-stretch rounded-full shrink-0"
                                style={{ background: Number(tx.amount) >= 0 ? '#4FBF7F' : '#F07A3E', minHeight: 28 }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{tx.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{tx.date}</span>
                                  <ProjectCategoryPicker
                                    tx={tx}
                                    categories={sel.categories ?? []}
                                    projectId={sel.id}
                                    onAssign={(catId) => reassignTxCategory(tx.id, sel.id, catId)}
                                  />
                                </div>
                              </div>
                              <span className="text-sm font-semibold tabular-nums shrink-0"
                                style={{ color: Number(tx.amount) >= 0 ? '#4FBF7F' : '#F07A3E' }}>
                                {Number(tx.amount) >= 0 ? '+' : ''}${Math.abs(Number(tx.amount)).toFixed(2)}
                              </span>
                              <button onClick={() => doUnlink(tx, sel.id)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/20"
                                title="Unlink" style={{ color: 'var(--color-text-muted)' }}>
                                <UnlinkIcon />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 py-8 text-center rounded-xl"
                          style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                          <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>No transactions linked yet</p>
                          <button onClick={() => openLinkPicker(sel.id)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg hover:brightness-110"
                            style={{ background: `${color}18`, color, border: `1px solid ${color}35` }}>
                            + Link Transaction
                          </button>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })()}
          </div>

        </div>

        {/* ── Create / Edit project modal ── */}
        {showForm && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}>
            <form onSubmit={handleSave}
              className="w-full max-w-lg flex flex-col rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(6, 12, 38, 0.98)',
                border: '1px solid rgba(255,255,255,0.14)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.09)',
              }}>

              {/* ── Live preview header ── */}
              {(() => {
                const typeMeta = PROJECT_TYPES.find((t) => t.value === form.type)!;
                return (
                  <div className="flex items-center justify-between gap-4 px-6 py-5"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.10)',
                      background: `linear-gradient(135deg, ${form.color}18 0%, transparent 55%)`,
                    }}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 overflow-hidden"
                        style={{ background: `${form.color}28`, border: `1px solid ${form.color}55`, boxShadow: `0 0 20px ${form.color}25` }}>
                        {form.imageUrl
                          ? <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
                          : typeMeta.icon}
                      </div>
                      <div>
                        <p className="font-bold text-base leading-snug"
                          style={{ color: form.name ? 'var(--color-text-primary)' : 'var(--color-text-muted)', letterSpacing: '-0.01em' }}>
                          {form.name || (editing ? 'Edit Project' : 'New Project')}
                        </p>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-lg mt-0.5 inline-block"
                          style={{ background: `${form.color}22`, color: form.color, border: `1px solid ${form.color}33` }}>
                          {typeMeta.label} · {typeMeta.hint}
                        </span>
                      </div>
                    </div>
                    <button type="button" onClick={closeForm}
                      className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors duration-150 shrink-0"
                      style={{ color: 'var(--color-text-muted)', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.10)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                );
              })()}

              <div className="flex flex-col gap-5 px-6 py-5">

                {/* ── Type selector ── */}
                <div className="flex flex-col gap-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Type</span>
                  <div className="grid grid-cols-4 gap-2.5">
                    {MAIN_TYPES.map((t) => {
                      const active = form.type === t.value || (t.value === 'business' && form.type === 'service');
                      return (
                        <button key={t.value} type="button"
                          onClick={() => setForm((f) => ({ ...f, type: t.value, icon: t.icon }))}
                          className="flex flex-col items-center gap-2 py-4 rounded-2xl text-xs font-semibold transition-all duration-150"
                          style={{
                            cursor: 'pointer',
                            ...(active
                              ? { background: `${form.color}22`, border: `1.5px solid ${form.color}66`, color: form.color, boxShadow: `0 0 16px ${form.color}22` }
                              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-secondary)' }),
                          }}>
                          <span className="text-2xl">{t.icon}</span>
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Business sub-type */}
                  {(form.type === 'business' || form.type === 'service') && (
                    <div className="flex gap-2">
                      {BUSINESS_SUBTYPES.map((s) => (
                        <button key={s.value} type="button"
                          onClick={() => setForm((f) => ({ ...f, type: s.value }))}
                          className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150"
                          style={{
                            cursor: 'pointer',
                            ...(form.type === s.value
                              ? { background: `${form.color}18`, border: `1px solid ${form.color}44`, color: form.color }
                              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: 'var(--color-text-muted)' }),
                          }}>
                          <span className="text-lg">{s.icon}</span>
                          <div className="text-left">
                            <p className="font-semibold leading-tight">{s.label}</p>
                            <p className="text-[10px] leading-tight opacity-65">{s.hint}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {!editing && (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Categories will be pre-filled based on type.
                    </p>
                  )}
                </div>

                {/* ── Name ── */}
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Name</span>
                  <input required autoFocus
                    placeholder={PROJECT_TYPES.find((t) => t.value === form.type)?.placeholder ?? 'Project name'}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    onFocus={focusInput} onBlur={blurInput}
                    className="px-4 py-3 text-sm outline-none rounded-xl w-full transition-all duration-150"
                    style={inputStyle} />
                </div>

                {/* ── Description + Purchase Price ── */}
                <div className={`grid gap-3 ${form.type === 'service' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                      Description <span style={{ opacity: 0.45, textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>(optional)</span>
                    </span>
                    <input placeholder="Short note…" value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      onFocus={focusInput} onBlur={blurInput}
                      className="px-4 py-3 text-sm outline-none rounded-xl transition-all duration-150"
                      style={inputStyle} />
                  </div>
                  {form.type !== 'service' && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                        {form.type === 'property' || form.type === 'vehicle' ? 'Purchase Price' : 'Initial Investment'}
                      </span>
                      <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.13)' }}>
                        <span className="flex items-center px-3 text-sm font-semibold shrink-0"
                          style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-secondary)', borderRight: '1px solid rgba(255,255,255,0.10)' }}>$</span>
                        <input type="number" step="0.01" min="0" placeholder="0.00" value={form.purchasePrice}
                          onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))}
                          className="flex-1 px-4 py-3 text-sm outline-none min-w-0 transition-all duration-150"
                          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-primary)' }} />
                      </div>
                      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                        💡 Use <strong style={{ color: 'rgba(255,255,255,0.45)' }}>one method only</strong> to avoid double-counting:{' '}
                        enter the price here <em>or</em> link the payment transaction later — not both.
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Date + Color ── */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                      {form.type === 'service' ? 'Start Date' : 'Purchase Date'}
                    </span>
                    <input type="date" value={form.purchaseDate}
                      onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                      onFocus={focusInput} onBlur={blurInput}
                      className="px-4 py-3 text-sm outline-none rounded-xl w-full transition-all duration-150"
                      style={{ ...inputStyle, colorScheme: 'dark' }} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Color</span>
                    <div className="flex items-center gap-2.5 px-4 rounded-xl h-[50px]" style={inputStyle}>
                      {PRESET_COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                          className="w-6 h-6 rounded-full transition-all duration-150 shrink-0"
                          style={{
                            background: c,
                            cursor: 'pointer',
                            transform: form.color === c ? 'scale(1.2)' : 'scale(1)',
                            boxShadow: form.color === c ? `0 0 0 2px rgba(6,12,38,0.9), 0 0 0 4px ${c}` : 'none',
                          }} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Image upload ── */}
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                    Image <span style={{ opacity: 0.45, textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>(optional)</span>
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => setForm((f) => ({ ...f, imageUrl: ev.target?.result as string }));
                      reader.readAsDataURL(file);
                    }}
                  />
                  {form.imageUrl ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
                      <img src={form.imageUrl} alt="Project" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Image selected</p>
                        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Shown on the project card</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg hover:brightness-110"
                          style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}>
                          Change
                        </button>
                        <button type="button" onClick={() => { setForm((f) => ({ ...f, imageUrl: '' })); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg hover:bg-red-500/20"
                          style={{ color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.25)', cursor: 'pointer' }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-3 p-3 rounded-xl transition-all duration-150 hover:bg-white/5"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)', cursor: 'pointer' }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
                        <ImageIcon />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Upload an image</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>PNG, JPG, WEBP — shown on the project card</p>
                      </div>
                    </button>
                  )}
                </div>

              </div>

              {/* ── Footer ── */}
              <div className="flex gap-3 justify-end px-6 py-5"
                style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
                <button type="button" onClick={closeForm}
                  className="px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-150"
                  style={{ color: 'var(--color-text-secondary)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.10)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-6 py-2.5 text-sm font-bold rounded-xl transition-all duration-150 disabled:opacity-60"
                  style={{
                    background: form.color,
                    color: 'white',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    boxShadow: `0 4px 18px ${form.color}50`,
                    letterSpacing: '0.01em',
                  }}
                  onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.filter = 'brightness(1.12)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = 'none'; }}>
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
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 shrink-0"
                  style={{ color: 'var(--color-text-muted)' }}>✕</button>
              </div>

              {/* Payment source tabs */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>How did you receive payment?</span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setSellMode('bank'); setSellLinkedTx(null); setSellForm(f => ({ ...f, salePrice: '' })); }}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                    style={sellMode === 'bank'
                      ? { background: 'rgba(75,168,216,0.18)', color: '#4BA8D8', border: '1px solid rgba(75,168,216,0.40)' }
                      : { background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="text-xl">🏦</span>
                    <span>Bank Deposit</span>
                  </button>
                  <button type="button" onClick={() => { setSellMode('cash'); setSellLinkedTx(null); setSellForm(f => ({ ...f, salePrice: '' })); }}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                    style={sellMode === 'cash'
                      ? { background: 'rgba(79,191,127,0.18)', color: '#4FBF7F', border: '1px solid rgba(79,191,127,0.40)' }
                      : { background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
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
                      style={{ background: 'rgba(75,168,216,0.10)', border: '1px solid rgba(75,168,216,0.30)' }}>
                      <span className="text-xl shrink-0">🏦</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{sellLinkedTx.name}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {sellLinkedTx.date} · {sellLinkedTx.bankAccount?.bankName}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: '#4BA8D8' }}>
                        +${Number(sellLinkedTx.amount).toFixed(2)}
                      </span>
                      <button type="button" onClick={() => { setSellLinkedTx(null); setSellForm(f => ({ ...f, salePrice: '' })); }}
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10 shrink-0 text-xs"
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
                            <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: '#4FBF7F' }}>
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
                      style={{ background: 'rgba(79,191,127,0.10)', border: '1px solid rgba(79,191,127,0.30)' }}>
                      <span className="text-xl shrink-0">💵</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{sellLinkedTx.name}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {sellLinkedTx.date} · {sellLinkedTx.bankAccount?.bankName ?? 'Cash'}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: '#4FBF7F' }}>
                        +${Number(sellLinkedTx.amount).toFixed(2)}
                      </span>
                      <button type="button" onClick={() => { setSellLinkedTx(null); setSellForm(f => ({ ...f, salePrice: '' })); }}
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10 shrink-0 text-xs"
                        style={{ color: 'var(--color-text-muted)' }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div className="px-3 py-2.5 rounded-xl text-xs flex items-start gap-2"
                        style={{ background: 'rgba(245,200,66,0.07)', border: '1px solid rgba(245,200,66,0.20)', color: 'rgba(245,200,66,0.90)' }}>
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
                            <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: '#4FBF7F' }}>
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
                <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {(() => {
                    const sale = parseFloat(sellForm.salePrice) || 0;
                    const net  = sale - showSell.costBasis + showSell.income;
                    const roi  = showSell.costBasis > 0 ? (net / showSell.costBasis) * 100 : 0;
                    const gain = net >= 0;
                    return (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Estimated Net Gain</p>
                          <p className="font-bold text-xl mt-0.5" style={{ color: gain ? '#4FBF7F' : '#F07A3E' }}>
                            {gain ? '+' : ''}${net.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>ROI</p>
                          <p className="font-bold text-xl mt-0.5" style={{ color: gain ? '#4FBF7F' : '#F07A3E' }}>
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
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-white/10"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={selling || (!sellForm.salePrice && !sellLinkedTx)}
                  className="px-5 py-2 text-sm font-semibold rounded-xl hover:brightness-110 disabled:opacity-50"
                  style={{ background: 'rgba(79,191,127,0.20)', color: '#4FBF7F', border: '1px solid rgba(79,191,127,0.35)' }}>
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
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10"
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
                          style={linked ? { background: 'rgba(155,109,255,0.12)', border: '1px solid rgba(155,109,255,0.25)' } : {}}>
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
                            style={{ color: Number(tx.amount) >= 0 ? '#4FBF7F' : '#F07A3E' }}>
                            {Number(tx.amount) >= 0 ? '+' : ''}${Math.abs(Number(tx.amount)).toFixed(2)}
                          </span>
                          <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                            style={linked
                              ? { background: '#9B6DFF', color: 'white' }
                              : { border: '1.5px solid rgba(255,255,255,0.20)' }}>
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
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-lg"
                      style={{ color: 'var(--color-text-muted)' }}>←</button>
                    <p className="font-bold text-base flex-1">Categorize for this project</p>
                    <button onClick={() => { setShowLinkPicker(null); setPendingLinkTx(null); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10"
                      style={{ color: 'var(--color-text-muted)' }}>✕</button>
                  </div>

                  {/* Transaction summary */}
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl shrink-0"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{pendingLinkTx.name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{pendingLinkTx.date}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums"
                      style={{ color: Number(pendingLinkTx.amount) >= 0 ? '#4FBF7F' : '#F07A3E' }}>
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
                          : { border: '1px solid rgba(255,255,255,0.08)' }}>
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
                              ? { background: 'rgba(155,109,255,0.12)', border: '1px solid rgba(155,109,255,0.30)' }
                              : { border: '1px solid rgba(255,255,255,0.08)' }}>
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
                      className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-white/10"
                      style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
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
              style={{ background: 'var(--color-surface)', border: '1px solid rgba(255,107,107,0.20)', boxShadow: 'var(--glass-shadow)' }}>

              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ background: 'rgba(255,107,107,0.12)', border: '1px solid rgba(255,107,107,0.22)' }}>
                  🗑️
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base">Delete "{confirmDelete.name}"?</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    This will permanently delete the project. All{' '}
                    <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>
                      {confirmDelete.txCount} linked transaction{confirmDelete.txCount !== 1 ? 's' : ''}
                    </span>{' '}
                    will be unlinked and left uncategorized from this project.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl text-xs flex items-start gap-2"
                style={{ background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.18)', color: 'rgba(255,180,180,0.85)' }}>
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>This action cannot be undone.</span>
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-white/10"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Cancel
                </button>
                <button onClick={() => handleDelete(confirmDelete)} disabled={deleting === confirmDelete.id}
                  className="px-5 py-2 text-sm font-semibold rounded-xl hover:brightness-110 disabled:opacity-60"
                  style={{ background: 'rgba(255,107,107,0.20)', color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.35)' }}>
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
          : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--color-text-muted)' }}>
        {current ? <><span>{current.icon}</span><span>{current.name}</span></> : <span>+ Tag</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 rounded-xl overflow-hidden min-w-36"
          style={{ background: 'var(--color-surface)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
          {current && (
            <button
              onClick={() => { onAssign(null); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/10 text-left"
              style={{ color: '#FF6B6B' }}>
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
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/10 text-left"
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
                      style={{ color: 'var(--color-text-muted)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
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
      <p className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</p>
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
function ImageIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
}
