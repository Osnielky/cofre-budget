'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import RecurringPanel, { emptyRecurring, occurrenceDates, type RecurringState } from '@/components/RecurringPanel';
import DatePicker from '@/components/DatePicker';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import { useUser } from '@/components/UserProvider';
import CsvImportModal from '@/components/CsvImportModal';
import ImportReconcileModal from '@/components/ImportReconcileModal';
import BankSelect, { BANKS } from '@/components/BankSelect';
import CategoryFormModal from '@/components/CategoryFormModal';
import AccountTypeIcon from '@/components/AccountTypeIcon';
import LinkIcon from '@/components/LinkIcon';
import InfoIcon from '@/components/InfoIcon';
import { ACCOUNT_GROUPS, accountTypeLabel, accountTypeMeta, isImportable, isLiability } from '@/lib/accountTypes';
// Lazy: pulls in @dnd-kit (~19 KB gz) only when someone opens the split modal.
const SplitTransactionModal = dynamic(() => import('@/components/SplitTransactionModal'), { ssr: false });
import { InsightsPanel, SubscriptionStore } from './InsightsPanel';
import { buildRecurringMap, normalize } from './recurring';
import { pickProjectSuggestion } from '@/lib/transactions/suggestions';
import LinkTransferModal from '@/components/LinkTransferModal';
import StatStrip from './StatStrip';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

/* Mirrors DELETABLE_SOURCES in the API's TransactionsService. Plaid rows are
   owned by the bank feed — the next sync would bring a deleted one back — so
   they get no delete control rather than one that fails. */
const DELETABLE_SOURCES = new Set(['manual', 'recurring', 'csv']);

interface PickerPos { top: number; left: number; width: number; maxHeight: number; origin: string }

/** Where to put the category picker for a given trigger.
 *
 *  It scales with the viewport rather than using a fixed 220x360 box, and when
 *  neither side of the trigger has room for a usable list it centres the panel
 *  instead of squeezing it into a sliver. Always clamped inside the viewport.
 */
function placePicker(rect: DOMRect): PickerPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const GAP = 8;
  const MARGIN = 16;
  /** Below this the list is too short to scan; centre instead of anchoring. */
  const COMFORTABLE = 340;

  const width = Math.round(Math.min(460, Math.max(280, vw - MARGIN * 2)));
  const cap = Math.round(Math.min(620, vh - MARGIN * 2));

  const spaceBelow = vh - rect.bottom - GAP - MARGIN;
  const spaceAbove = rect.top - GAP - MARGIN;

  // Right-align to the trigger, then keep the whole panel on screen.
  const left = Math.round(Math.min(Math.max(MARGIN, rect.right - width), vw - width - MARGIN));

  /** Keep the panel fully on screen — the trigger itself may be scrolled out of view. */
  const clampTop = (top: number, h: number) =>
    Math.round(Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - h - MARGIN)));

  if (spaceBelow >= Math.min(cap, COMFORTABLE)) {
    const maxHeight = Math.min(cap, spaceBelow);
    return { top: clampTop(rect.bottom + GAP, maxHeight), left, width, maxHeight, origin: 'top right' };
  }
  if (spaceAbove >= Math.min(cap, COMFORTABLE)) {
    const maxHeight = Math.min(cap, spaceAbove);
    return { top: clampTop(rect.top - GAP - maxHeight, maxHeight), left, width, maxHeight, origin: 'bottom right' };
  }
  // Neither side fits: centre it vertically so the full list is usable.
  const maxHeight = Math.min(cap, vh - MARGIN * 2);
  return { top: clampTop((vh - maxHeight) / 2, maxHeight), left, width, maxHeight, origin: 'center' };
}

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface BankAccount { id: string; bankName: string; accountName: string; accountType: string; color: string; provider: string; plaidItemId: string | null; last4?: string | null }
interface ProjectCategory { id: string; name: string; icon: string; color: string }
interface Project { id: string; name: string; icon: string; color: string; status: string; type?: string; imageUrl?: string | null; purchaseTxId: string | null; purchasePrice?: number; categories?: ProjectCategory[] }
interface TransferMatch { id: string; name: string; amount: number; date: string; bankAccount: BankAccount | null }
interface Transaction {
  id: string; name: string; merchantName: string | null; amount: number; date: string; source: string; pending: boolean;
  categoryId: string | null; categoryRef: Category | null;
  bankAccountId: string; bankAccount: BankAccount | null;
  projectId: string | null;
  projectCategoryId: string | null;
  transferAccountId: string | null;
  transferAccount: BankAccount | null;
  counterpartTxId: string | null;
  debtId: string | null;
  parentId: string | null;
  isSplitParent: boolean;
  note: string | null;
  receiptId: string | null;
  categorizedByRuleId: string | null;
  categorizedByRule: { id: string; matchValue: string } | null;
}
interface DebtLite { id: string; borrowerName: string; remaining: number; status: 'open' | 'paid'; direction: 'lent' | 'owed' }

type Filter    = 'all' | 'uncategorized' | 'expense' | 'income' | 'recurring';
type RangeMode = 'month' | 'custom';

type RuleToast =
  | { kind: 'created'; matchLabel: string; matchStrategy?: 'exact' | 'prefix' }
  | { kind: 'duplicate'; matchLabel: string }
  | { kind: 'error'; matchLabel: string; reason?: string }
  | { kind: 'categorized'; tx: Transaction; categoryId: string; categoryLabel: string; categoryIcon?: string };

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

/* ── date helpers ──────────────────────────────────────────────── */
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
function monthFrom(m: string) { return `${m}-01`; }
function monthTo(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).toISOString().slice(0, 10);
}
function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatAmount(n: number) {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
  return n >= 0 ? `+$${abs}` : `-$${abs}`;
}
/* TYPE_META kept only as a fallback label map; icons now use AccountTypeIcon */
const TYPE_META: Record<string, string> = { savings: '🏦', investment: '📈', cash: '💵', loan: '🤝' };

/* ═══════════════════════════════════════════════════════════════ */
export default function TransactionsPage() {
  const { user } = useUser();
  const [month, setMonth]           = useState(currentMonth);
  const [rangeMode, setRangeMode]   = useState<RangeMode>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [prevTransactions, setPrevTransactions] = useState<Transaction[]>([]);
  const [sortMode, setSortMode] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [categories, setCategories]     = useState<Category[]>([]);
  const [accounts, setAccounts]         = useState<BankAccount[]>([]);
  const [projects, setProjects]         = useState<Project[]>([]);
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [filter, setFilter]             = useState<Filter>('all');
  const [search, setSearch]             = useState('');
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [pickerPos, setPickerPos]       = useState<PickerPos | null>(null);
  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [importAccount, setImportAccount]       = useState<BankAccount | null>(null);
  const [showImportPicker, setShowImportPicker] = useState(false);
  const [showFileImport, setShowFileImport]     = useState(false);
  const [showAddAccForm, setShowAddAccForm]     = useState(false);
  const [addingAcc, setAddingAcc]               = useState(false);
  const [addAccError, setAddAccError]           = useState('');
  const [newAcc, setNewAcc] = useState({ bankName: '', accountName: '', accountType: 'checking', color: '#9B6DFF', currency: 'USD', openingBalance: '' });
  const [newAccTypeOpen, setNewAccTypeOpen] = useState(false);
  const pickerRef     = useRef<HTMLDivElement>(null);
  const importBtnRef  = useRef<HTMLDivElement>(null);

  const [pickerProjectDrill, setPickerProjectDrill]   = useState<string | null>(null);
  const [pickerShowPurchasePrompt, setPickerShowPurchasePrompt] = useState(false);
  const [pickerTransferStep, setPickerTransferStep]   = useState(false);
  const [pickerSearch, setPickerSearch]               = useState('');
  const [rowMenuTxId, setRowMenuTxId] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos]   = useState<{ top: number; left: number } | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [transferMatches, setTransferMatches]         = useState<TransferMatch[]>([]);
  const [transferMatchesLoading, setTransferMatchesLoading] = useState(false);
  const [linkingProj, setLinkingProj]                 = useState(false);
  const [deleteConfirmId, setDeleteConfirmId]         = useState<string | null>(null);
  const [editingTxId, setEditingTxId]                 = useState<string | null>(null);
  const [transferModal, setTransferModal]             = useState<{ tx: Transaction; categoryId: string } | null>(null);
  const [transferModalMatches, setTransferModalMatches] = useState<Transaction[]>([]);
  const [transferModalLoading, setTransferModalLoading] = useState(false);
  const [markAsSaleConfirm, setMarkAsSaleConfirm]     = useState<string | null>(null); // projectId
  const [markAsSaleSaving, setMarkAsSaleSaving]       = useState(false);

  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatForTxId, setNewCatForTxId]     = useState<string | null>(null);
  const [showManualTx, setShowManualTx]   = useState(false);
  const [manualTxSaving, setManualTxSaving] = useState(false);
  const [manualTxError, setManualTxError] = useState('');
  const [manualAccOpen, setManualAccOpen] = useState(false);
  const [manualCatOpen, setManualCatOpen] = useState(false);
  const [manualCatSearch, setManualCatSearch] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const EMPTY_MANUAL_TX = { name: '', amountStr: '', sign: '-' as '+' | '-', date: today, bankAccountId: '', categoryId: '', debtId: '', note: '', projectId: '', projectCategoryId: '' };
  const [manualTx, setManualTx] = useState({ name: '', amountStr: '', sign: '-' as '+' | '-', date: today, bankAccountId: '', categoryId: '', debtId: '', note: '', projectId: '', projectCategoryId: '' });
  const [recurring, setRecurring] = useState<RecurringState>(() => emptyRecurring(new Date().toISOString().slice(0, 10)));
  const [debts, setDebts] = useState<DebtLite[]>([]);
  const [splitTx, setSplitTx] = useState<Transaction | null>(null);
  const [selectedTx, setSelectedTx]       = useState<Transaction | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionStore>({});

  const [importToast, setImportToast] = useState<{ imported: number; skipped: number; account: { bankName: string; accountName: string; accountType: string; color: string } } | null>(null);
  const importToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ruleToast, setRuleToast] = useState<RuleToast | null>(null);
  const ruleToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* name → most-recently-used category (cross-period, loaded once) */
  const [categoryHints, setCategoryHints] = useState<Record<string, { id: string; name: string; icon: string; color: string }>>({});
  const [projectHints, setProjectHints]   = useState<Record<string, { projectId: string; projectCategoryId: string; catName: string; catIcon: string; catColor: string }>>({});

  const [budgetWidth, setBudgetWidth] = useState(256);

  useEffect(() => {
    const saved = localStorage.getItem('budgetWidth');
    if (saved) setBudgetWidth(Number(saved));
    try {
      const subs = localStorage.getItem('cofre:subscriptions');
      if (subs) setSubscriptions(JSON.parse(subs));
    } catch { /* ignore malformed data */ }
  }, []);
  const dragRef = useRef<{ active: boolean; startX: number; startWidth: number }>({ active: false, startX: 0, startWidth: 0 });

  function startBudgetResize(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startWidth: budgetWidth };
    function onMove(ev: MouseEvent) {
      if (!dragRef.current.active) return;
      const delta = dragRef.current.startX - ev.clientX;
      const next = Math.min(480, Math.max(180, dragRef.current.startWidth + delta));
      setBudgetWidth(next);
    }
    function onUp() {
      dragRef.current.active = false;
      setBudgetWidth((w) => { localStorage.setItem('budgetWidth', String(w)); return w; });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const ACC_COLORS = ['#9B6DFF', '#4FBF7F', '#F07A3E', '#F5C842', '#4BA8D8', '#E879A0'];

  const from = rangeMode === 'month' ? monthFrom(month) : customFrom;
  const to   = rangeMode === 'month' ? monthTo(month)   : customTo;

  /* A bulk import (e.g. six months of brokerage history) often lands entirely
     outside the currently-viewed month — switch to a custom range covering it
     and scope the account filter to what was just imported, so the list isn't
     left showing "No transactions found" right after a successful import. */
  function jumpToImportedRange(result: { account: { id: string }; dateRange: { from: string; to: string } | null }) {
    if (!result.dateRange) return;
    const alreadyVisible = result.dateRange.from >= from && result.dateRange.to <= to;
    if (!alreadyVisible) {
      setRangeMode('custom');
      setCustomFrom(result.dateRange.from);
      setCustomTo(result.dateRange.to);
    }
    setAccountFilter(result.account.id);
  }

  /* Previous window (for stat deltas + insight card): previous month, or the
     same-length span immediately before a custom range. */
  const prevRange = useMemo(() => {
    if (rangeMode === 'month') {
      const pm = prevMonth(month);
      return { from: monthFrom(pm), to: monthTo(pm), label: monthLabel(pm) };
    }
    if (customFrom && customTo) {
      const f = new Date(`${customFrom}T00:00:00Z`);
      const t = new Date(`${customTo}T00:00:00Z`);
      const days = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
      const pf = new Date(f); pf.setUTCDate(pf.getUTCDate() - days);
      const pt = new Date(f); pt.setUTCDate(pt.getUTCDate() - 1);
      return { from: pf.toISOString().slice(0, 10), to: pt.toISOString().slice(0, 10), label: 'prior period' };
    }
    return null;
  }, [rangeMode, month, customFrom, customTo]);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to)   params.set('to', to);
      const cur = fetch(`${API}/transactions?${params}`, { credentials: 'include' }).then((r) => r.json());
      const prev = prevRange
        ? fetch(`${API}/transactions?from=${prevRange.from}&to=${prevRange.to}`, { credentials: 'include' })
            .then((r) => r.json()).catch(() => [])
        : Promise.resolve([]);
      const [data, prevData] = await Promise.all([cur, prev]);
      setTransactions(Array.isArray(data) ? data : []);
      setPrevTransactions(Array.isArray(prevData) ? prevData : []);
    } finally {
      setLoading(false);
    }
  }, [from, to, prevRange]);


  useEffect(() => {
    Promise.all([
      fetch(`${API}/categories`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/bank-accounts`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/projects`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/transactions/category-hints`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/transactions/project-hints`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
      fetch(`${API}/debts`, { credentials: 'include' }).then((r) => r.json()).catch(() => []),
    ]).then(([cats, accs, projs, hints, pHints, dbt]) => {
      setCategories(Array.isArray(cats) ? cats : []);
      setAccounts(Array.isArray(accs) ? accs : []);
      setProjects(Array.isArray(projs) ? projs : []);
      if (hints && typeof hints === 'object') setCategoryHints(hints);
      if (pHints && typeof pHints === 'object') setProjectHints(pHints);
      setDebts(Array.isArray(dbt) ? dbt : []);
    }).catch(() => {});
  }, []);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  /* Escape closes the category picker — it can be a large centred panel now,
     so leaving the keyboard with no way out would be a trap. */
  useEffect(() => {
    if (!openPickerId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpenPickerId(null);
      setPickerProjectDrill(null);
      setPickerTransferStep(false);
      setPickerSearch('');
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openPickerId]);

  /* The picker is position:fixed against a rect captured at open time, so an
     outside scroll or a resize detaches it from its row. Close on both.
     Scrolling the picker's OWN list must not close it. */
  useEffect(() => {
    if (!openPickerId) return;
    const close = () => {
      setOpenPickerId(null);
      setPickerProjectDrill(null);
      setPickerTransferStep(false);
      setPickerSearch('');
    };
    const onScroll = (e: Event) => {
      const t = e.target as Node;
      if (pickerRef.current && (pickerRef.current === t || pickerRef.current.contains(t))) return;
      close();
    };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openPickerId]);

  /* close pickers on outside click */
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (openPickerId && pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpenPickerId(null);
        setPickerProjectDrill(null);
        setPickerTransferStep(false);
        setPickerSearch('');
        setMarkAsSaleConfirm(null);
      }
      if (showImportPicker && importBtnRef.current && !importBtnRef.current.contains(e.target as Node)) {
        // When the add-account sub-form is open, BankSelect's portal dropdown is outside importBtnRef —
        // ignore clicks on any element that has data-bank-select on it or its ancestors.
        const isInsideBankSelectPortal = !!(e.target as Element)?.closest?.('[data-bank-select]');
        if (isInsideBankSelectPortal) return;
        setShowImportPicker(false);
        setShowAddAccForm(false);
        setAddAccError('');
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openPickerId, showImportPicker]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rowMenuTxId && rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) {
        setRowMenuTxId(null);
        setDeleteConfirmId(null);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [rowMenuTxId]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [notifOpen]);

  /* ── category assign ──
     Returns true if the assignment request succeeded, false otherwise, so
     callers can decide whether it's safe to proceed with a dependent action
     like creating a categorization rule. */
  async function assignCategory(txId: string, categoryId: string | null, keepOpen = false): Promise<boolean> {
    setUpdatingId(txId);
    if (!keepOpen) setOpenPickerId(null);

    /* If assigning a real budget category, fully unlink from any project */
    if (categoryId) {
      const tx = transactions.find((t) => t.id === txId);
      if (tx?.projectId) {
        await fetch(`${API}/projects/${tx.projectId}/unlink/${txId}`, {
          method: 'PATCH', credentials: 'include',
        });
        setTransactions((prev) => prev.map((t) =>
          t.id === txId ? { ...t, projectId: null, projectCategoryId: null } : t,
        ));
      }
    }

    const txBefore = transactions.find((t) => t.id === txId);
    const res = await fetch(`${API}/transactions/${txId}/category`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ categoryId }),
    });
    if (!res.ok) {
      setUpdatingId(null);
      return false;
    }
    const updated: Transaction = await res.json();
    const counterpartId = !categoryId ? txBefore?.counterpartTxId : null;
    setTransactions((prev) => prev.map((t) => {
      if (t.id === txId) return {
        ...t,
        categoryId: updated.categoryId,
        categoryRef: updated.categoryRef,
        debtId: updated.debtId ?? null,
        categorizedByRuleId: updated.categorizedByRuleId ?? null,
        categorizedByRule: updated.categorizedByRule ?? null,
        ...(!categoryId && { transferAccountId: null, transferAccount: null, counterpartTxId: null }),
      };
      if (counterpartId && t.id === counterpartId) return {
        ...t, transferAccountId: null, transferAccount: null, counterpartTxId: null,
      };
      return t;
    }));
    /* Keep hints fresh so newly-categorized names suggest immediately on other rows */
    if (categoryId && updated.categoryRef) {
      const tx = transactions.find((t) => t.id === txId);
      if (tx) {
        const { id, name, icon, color } = updated.categoryRef;
        setCategoryHints((prev) => ({ ...prev, [tx.name]: { id, name, icon, color } }));
      }
    }
    setUpdatingId(null);
    if (categoryId && updated.categoryRef && updated.categoryRef.type !== 'transfer') {
      if (ruleToastTimer.current) clearTimeout(ruleToastTimer.current);
      const mergedTx: Transaction = { ...(txBefore as Transaction), ...updated };
      setRuleToast({ kind: 'categorized', tx: mergedTx, categoryId, categoryLabel: updated.categoryRef.name, categoryIcon: updated.categoryRef.icon });
      ruleToastTimer.current = setTimeout(() => setRuleToast(null), 6000);
    } else {
      setRuleToast((prev) => (prev?.kind === 'categorized' && prev.tx.id === txId ? null : prev));
    }
    return true;
  }

  async function createRule(tx: Transaction, categoryId: string) {
    const matchLabel = tx.merchantName || tx.name;
    const res = await fetch(`${API}/categorization-rules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ transactionId: tx.id, categoryId }),
    });
    if (ruleToastTimer.current) clearTimeout(ruleToastTimer.current);
    if (res.status === 409) {
      setRuleToast({ kind: 'duplicate', matchLabel });
      ruleToastTimer.current = setTimeout(() => setRuleToast(null), 6000);
      return;
    }
    if (!res.ok) {
      setRuleToast({ kind: 'error', matchLabel });
      ruleToastTimer.current = setTimeout(() => setRuleToast(null), 6000);
      return;
    }
    const rule = await res.json();
    setRuleToast({
      kind: 'created',
      matchLabel: rule?.matchValue || matchLabel,
      matchStrategy: rule?.matchStrategy,
    });
    ruleToastTimer.current = setTimeout(() => setRuleToast(null), 6000);
    // No refetch: the rule changes nothing that is already on screen.
  }

  async function uncategorizeOne(tx: Transaction) {
    setRowMenuTxId(null);
    await assignCategory(tx.id, null);
  }

  async function deleteRuleFromRow(tx: Transaction) {
    if (!tx.categorizedByRuleId) return;
    const matchLabel = tx.categorizedByRule?.matchValue || tx.merchantName || tx.name;
    setDeletingRuleId(tx.categorizedByRuleId);
    setRowMenuTxId(null);
    const res = await fetch(`${API}/categorization-rules/${tx.categorizedByRuleId}`, { method: 'DELETE', credentials: 'include' });
    setDeletingRuleId(null);
    if (!res.ok) {
      if (ruleToastTimer.current) clearTimeout(ruleToastTimer.current);
      setRuleToast({ kind: 'error', matchLabel, reason: `Couldn't delete the rule for "${matchLabel}".` });
      ruleToastTimer.current = setTimeout(() => setRuleToast(null), 6000);
      return;
    }
    loadTransactions();
  }

  async function assignDebt(txId: string, debtId: string | null) {
    setUpdatingId(txId);
    setOpenPickerId(null);
    const res = await fetch(`${API}/transactions/${txId}/debt`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ debtId }),
    });
    if (!res.ok) { setUpdatingId(null); return; }
    const updated: Transaction = await res.json();
    setTransactions((prev) => prev.map((t) =>
      t.id === txId
        ? { ...t, debtId: updated.debtId, categoryId: updated.categoryId, categoryRef: updated.categoryRef }
        : t,
    ));
    setUpdatingId(null);
  }

  /* ── manual transaction ── */
  async function saveManualTx(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(manualTx.amountStr);
    setManualTxError('');
    if (!manualTx.amountStr || isNaN(amount) || amount <= 0) { setManualTxError('Enter an amount greater than zero.'); return; }
    if (!manualTx.bankAccountId) { setManualTxError('Choose an account for this transaction.'); return; }
    setManualTxSaving(true);
    try {
      const finalAmount = amount * (manualTx.sign === '-' ? -1 : 1);
      if (editingTxId) {
        const res = await fetch(`${API}/transactions/${editingTxId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: manualTx.name, amount: finalAmount, date: manualTx.date, bankAccountId: manualTx.bankAccountId, note: manualTx.note || null }),
        });
        if (!res.ok) return;
        const updated: Transaction = await res.json();
        setTransactions((prev) => prev.map((t) => t.id === editingTxId ? { ...t, ...updated } : t));
        setShowManualTx(false);
        setEditingTxId(null);
        setManualTx(EMPTY_MANUAL_TX);
        return;
      }
      // A recurring transaction is a rule, not a row: the server materialises
      // occurrences as their dates arrive. Reload afterwards so any already-due
      // ones show up.
      if (recurring.enabled) {
        const res = await fetch(`${API}/transactions/recurring`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: manualTx.name,
            amount: finalAmount,
            categoryId: manualTx.debtId ? null : (manualTx.categoryId || null),
            bankAccountId: manualTx.bankAccountId,
            note: manualTx.note || null,
            interval: recurring.interval,
            unit: recurring.unit,
            dayOfMonth: recurring.unit === 'month' || recurring.unit === 'year' ? recurring.dayOfMonth : null,
            startDate: recurring.startDate,
            endDate: recurring.endMode === 'on' ? (recurring.endDate || null) : null,
            occurrenceCount: recurring.endMode === 'after' ? recurring.count : null,
            recordFirstNow: recurring.recordFirst,
          }),
        });
        if (!res.ok) { setManualTxError('Could not save the recurring transaction.'); return; }
        await loadTransactions();
        setShowManualTx(false);
        setManualTx(EMPTY_MANUAL_TX);
        setRecurring(emptyRecurring(today));
        return;
      }

      const res = await fetch(`${API}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: manualTx.name,
          amount: finalAmount,
          date: manualTx.date,
          bankAccountId: manualTx.bankAccountId,
          categoryId: manualTx.debtId || manualTx.projectCategoryId ? null : (manualTx.categoryId || null),
          debtId: manualTx.debtId || null,
          note: manualTx.note || null,
          projectId: manualTx.projectId || null,
          projectCategoryId: manualTx.projectCategoryId || null,
        }),
      });
      if (!res.ok) return;
      const created: Transaction = await res.json();
      setTransactions((prev) => [created, ...prev]);
      setShowManualTx(false);
      setManualTx(EMPTY_MANUAL_TX);
    } finally {
      setManualTxSaving(false);
    }
  }

  /** Write the transfer note onto both legs so it reads the same from either side. */
  async function saveTransferNote(ids: (string | null)[], note: string) {
    await Promise.all(ids.filter(Boolean).map((id) =>
      fetch(`${API}/transactions/${id}/note`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ note }),
      }).catch(() => undefined),
    ));
    loadTransactions();
  }

  /** Load a transaction back into the manual modal for editing. */
  function openEditModal(tx: Transaction) {
    setEditingTxId(tx.id);
    setManualTx({
      name: tx.name,
      amountStr: String(Math.abs(Number(tx.amount))),
      sign: Number(tx.amount) >= 0 ? '+' : '-',
      date: tx.date,
      bankAccountId: tx.bankAccountId ?? '',
      categoryId: tx.categoryId ?? '',
      debtId: tx.debtId ?? '',
      note: tx.note ?? '',
      projectId: tx.projectId ?? '',
      projectCategoryId: tx.projectCategoryId ?? '',
    });
    setManualTxError('');
    setShowManualTx(true);
  }

  async function deleteManualTx(id: string) {
    const tx = transactions.find((t) => t.id === id);
    const res = await fetch(`${API}/transactions/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      // The row stays put rather than vanishing from a delete that never landed.
      const reason = await res.json().then((b) => b?.message).catch(() => null);
      if (ruleToastTimer.current) clearTimeout(ruleToastTimer.current);
      setRuleToast({ kind: 'error', matchLabel: tx?.name ?? '', reason: reason || "Couldn't delete this transaction." });
      ruleToastTimer.current = setTimeout(() => setRuleToast(null), 6000);
      setDeleteConfirmId(null);
      setRowMenuTxId(null);
      return;
    }
    setTransactions((prev) => prev
      .filter((t) => t.id !== id)
      .map((t) => t.id === tx?.counterpartTxId
        ? { ...t, transferAccountId: null, transferAccount: null, counterpartTxId: null }
        : t,
      ),
    );
    /* Refresh balances if there was a transfer account */
    if (tx?.transferAccountId) {
      fetch(`${API}/bank-accounts`, { credentials: 'include' })
        .then((r) => r.json()).then((accs) => { if (Array.isArray(accs)) setAccounts(accs); });
    }
    setDeleteConfirmId(null);
  }

  /* ── project link ── */
  async function linkToProject(txId: string, projectId: string, projectCategoryId: string | null) {
    setLinkingProj(true);
    try {
      await fetch(`${API}/projects/${projectId}/link/${txId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ projectCategoryId }),
      });

      /* If assigning a project category, clear the budget category */
      if (projectCategoryId) {
        await fetch(`${API}/transactions/${txId}/category`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ categoryId: null }),
        });
        setTransactions((prev) => prev.map((t) =>
          t.id === txId ? { ...t, projectId, projectCategoryId, categoryId: null, categoryRef: null } : t,
        ));
      } else {
        setTransactions((prev) => prev.map((t) =>
          t.id === txId ? { ...t, projectId, projectCategoryId } : t,
        ));
      }

      setOpenPickerId(null); setPickerProjectDrill(null); setPickerShowPurchasePrompt(false);
    } catch {
      // network/CORS error — silently ignore
    } finally { setLinkingProj(false); }
  }

  async function markAsPurchase(txId: string, projectId: string) {
    setLinkingProj(true);
    try {
      // Link the transaction to the project if not already linked
      const tx = transactions.find((t) => t.id === txId);
      if (tx?.projectId !== projectId) {
        const linkRes = await fetch(`${API}/projects/${projectId}/link/${txId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ projectCategoryId: null }),
        });
        if (!linkRes.ok) return;
      }
      // Then designate it as the purchase transaction
      const res = await fetch(`${API}/projects/${projectId}/purchase-tx`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ transactionId: txId }),
      });
      if (!res.ok) return;
      const updatedProject = await res.json();
      setTransactions((prev) => prev.map((t) =>
        t.id === txId ? { ...t, projectId, projectCategoryId: null } : t,
      ));
      setProjects((prev) => prev.map((p) =>
        p.id === projectId ? { ...p, purchaseTxId: updatedProject.purchaseTxId, costBasis: updatedProject.costBasis } : p,
      ));
      setOpenPickerId(null);
      setPickerProjectDrill(null);
      setPickerShowPurchasePrompt(false);
    } catch {
      // silently ignore network errors
    } finally { setLinkingProj(false); }
  }

  async function setTransferAccount(txId: string, transferAccountId: string | null, matchTxId?: string) {
    try {
      const res = await fetch(`${API}/transactions/${txId}/transfer-account`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ transferAccountId, matchTxId: matchTxId ?? null }),
      });
      if (!res.ok) return;
      const updated: Transaction = await res.json();
      setTransactions((prev) => prev.map((t) => {
        if (t.id === txId) return { ...t, transferAccountId: updated.transferAccountId, transferAccount: updated.transferAccount, counterpartTxId: matchTxId ?? null };
        if (matchTxId && t.id === matchTxId) {
          const srcAcc = prev.find((s) => s.id === txId)?.bankAccount ?? null;
          return { ...t, categoryId: updated.categoryId, categoryRef: updated.categoryRef, transferAccountId: updated.bankAccountId, transferAccount: srcAcc, counterpartTxId: txId };
        }
        return t;
      }));
      fetch(`${API}/bank-accounts`, { credentials: 'include' })
        .then((r) => r.json()).then((accs) => { if (Array.isArray(accs)) setAccounts(accs); });
    } catch {
      // network error — ignore
    } finally {
      setOpenPickerId(null);
      setPickerTransferStep(false);
      setTransferMatches([]);
    }
  }

  async function unlinkFromProject(txId: string, projectId: string) {
    setLinkingProj(true);
    try {
      await fetch(`${API}/projects/${projectId}/unlink/${txId}`, { method: 'PATCH', credentials: 'include' });
      setTransactions((prev) => prev.map((t) =>
        t.id === txId ? { ...t, projectId: null, projectCategoryId: null } : t,
      ));
      setOpenPickerId(null); setPickerProjectDrill(null);
    } finally { setLinkingProj(false); }
  }

  async function unsplitTransaction(tx: Transaction) {
    const parentId = tx.parentId!;
    const res = await fetch(`${API}/transactions/${tx.id}/unsplit`, {
      method: 'DELETE', credentials: 'include',
    });
    if (!res.ok) return;
    const restored: Transaction = await res.json();
    setTransactions((prev) => [
      restored,
      ...prev.filter((t) => t.parentId !== parentId && t.id !== parentId),
    ]);
  }

  async function markProjectAsSold(txId: string, projectId: string) {
    setMarkAsSaleSaving(true);
    try {
      const tx   = transactions.find((t) => t.id === txId);
      const proj = projects.find((p) => p.id === projectId);
      if (!tx || !proj) return;
      const saleIncomeCat = proj.categories?.find((c) => c.name === 'Sale Income');
      await fetch(`${API}/projects/${projectId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status: 'sold', salePrice: Math.abs(Number(tx.amount)), saleDate: tx.date }),
      });
      await fetch(`${API}/projects/${projectId}/link/${txId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ projectCategoryId: saleIncomeCat?.id ?? null }),
      });
      setTransactions((prev) => prev.map((t) =>
        t.id === txId ? { ...t, projectId, projectCategoryId: saleIncomeCat?.id ?? null } : t,
      ));
      setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, status: 'sold' } : p));
      setOpenPickerId(null); setPickerProjectDrill(null); setMarkAsSaleConfirm(null);
    } finally { setMarkAsSaleSaving(false); }
  }

  /* ── sync all Plaid accounts ── */
  async function syncAll() {
    const plaid = accounts.filter((a) => a.provider === 'plaid' && a.plaidItemId);
    if (!plaid.length) return;
    setSyncing(true);
    await Promise.all(plaid.map((a) =>
      fetch(`${API}/plaid/sync/${a.plaidItemId}`, { method: 'POST', credentials: 'include' }),
    ));
    await loadTransactions();
    setSyncing(false);
  }

  /* ── add account inline ── */
  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    setAddAccError('');
    const duplicate = accounts.some(
      (a) => a.bankName.toLowerCase() === newAcc.bankName.toLowerCase() &&
             a.accountName.toLowerCase() === newAcc.accountName.toLowerCase(),
    );
    if (duplicate) { setAddAccError('An account with this name already exists.'); return; }
    setAddingAcc(true);
    try {
      const res = await fetch(`${API}/bank-accounts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...newAcc, balance: newAcc.openingBalance ? parseFloat(newAcc.openingBalance) : 0 }),
      });
      const created: BankAccount = await res.json();
      setAccounts((prev) => [...prev, created]);
      setImportAccount(created);
      setShowImportPicker(false);
      setShowAddAccForm(false);
      setNewAcc({ bankName: '', accountName: '', accountType: 'checking', color: '#9B6DFF', currency: 'USD', openingBalance: '' });
    } finally { setAddingAcc(false); }
  }

  /* ── derived data ── */
  // Excluded from income/expense totals: transfers between own accounts, and debt repayments
  const isTransfer = (t: Transaction) => t.categoryRef?.type === 'transfer' || !!t.debtId;
  const openDebts = debts.filter((d) => d.status === 'open');
  const uncategorizedCount = transactions.filter((t) => !t.categoryId && !t.projectId && !isTransfer(t)).length;
  /* Current + previous window: gives buildRecurringMap the ≥2 months it needs
     to detect repeats even inside a one-month view. Declared before `visible`,
     which calls isRecurringTx during the same render pass. */
  const recurringMap = useMemo(
    () => buildRecurringMap([...transactions, ...prevTransactions].filter((t) => Number(t.amount) < 0)),
    [transactions, prevTransactions]
  );
  const statMonth = rangeMode === 'month' ? month : (from ? from.slice(0, 7) : currentMonth());
  const prevStatMonth = prevRange ? prevRange.from.slice(0, 7) : '';
  const recurringTotalIn = (mo: string) =>
    [...recurringMap.values()]
      .filter((r) => r.occurrences.some((o) => o.month === mo))
      .reduce((s, r) => s + r.medianAmount, 0);
  const recurringNowTotal  = recurringTotalIn(statMonth);
  const recurringPrevTotal = prevStatMonth ? recurringTotalIn(prevStatMonth) : 0;

  const isRecurringTx = (t: Transaction) => Number(t.amount) < 0 && recurringMap.has(normalize(t.name));
  const visible = transactions.filter((t) => {
    if (filter === 'uncategorized' && (t.categoryId || t.projectId || isTransfer(t))) return false;
    if (filter === 'expense'       && (Number(t.amount) >= 0 || isTransfer(t))) return false;
    if (filter === 'income'        && (Number(t.amount) < 0  || isTransfer(t))) return false;
    if (filter === 'recurring'     && !isRecurringTx(t)) return false;
    if (accountFilter !== 'all'    && t.bankAccountId !== accountFilter) return false;
    if (categoryFilter !== 'all'   && t.categoryId !== categoryFilter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  /* Sorting: date modes reorder the day groups; amount modes keep the day
     grouping and reorder rows within each day. */
  if (sortMode === 'date-asc') visible.sort((a, b) => a.date.localeCompare(b.date));
  else if (sortMode === 'amount-desc') visible.sort((a, b) => b.date.localeCompare(a.date) || Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));
  else if (sortMode === 'amount-asc')  visible.sort((a, b) => b.date.localeCompare(a.date) || Math.abs(Number(a.amount)) - Math.abs(Number(b.amount)));

  /* Group by account first, then by date within each account */
  const byAccount = visible.reduce<Map<string, Transaction[]>>((map, tx) => {
    const key = tx.bankAccountId ?? 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
    return map;
  }, new Map());

  const accountGroups = [...byAccount.entries()].sort(([, a], [, b]) =>
    (a[0]?.bankAccount?.bankName ?? '').localeCompare(b[0]?.bankAccount?.bankName ?? ''),
  );

  const hasPlaid = accounts.some((a) => a.provider === 'plaid');

  /* Collapse state — accounts */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggleCollapse(id: string) {
    setCollapsed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allCollapsed = accountGroups.length > 0 && accountGroups.every(([id]) => collapsed.has(id));

  /* Collapse state — date groups (key = accountId::date) */
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  function toggleCollapseDate(key: string) {
    setCollapsedDates((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const insightsMonth = rangeMode === 'month' ? month : (from ? from.slice(0, 7) : currentMonth());

  function handleSubscriptionChange(next: SubscriptionStore) {
    setSubscriptions(next);
    localStorage.setItem('cofre:subscriptions', JSON.stringify(next));
  }

  function handleNoteUpdate(txId: string, note: string | null) {
    setTransactions((ts) => ts.map((t) => t.id === txId ? { ...t, note } : t));
    setSelectedTx((prev) => prev?.id === txId ? { ...prev, note } : prev);
  }

  /* ════════════════════════════════════════════════════════════ */
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto min-w-0 pt-14 md:pt-0">

        {/* ── Sticky header (desktop only — too tall to pin on narrow viewports) ── */}
        <div className="md:sticky md:top-0 z-20 px-6 pt-5 pb-4 flex flex-col gap-4"
          style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }}>

          {/* Title + actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Track, review and organize your money</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <div className="relative" ref={notifRef}>
                <button onClick={() => setNotifOpen((v) => !v)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-[var(--color-elevated)]"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                  title="Notifications">
                  <BellIcon />
                </button>
                {notifOpen && (
                  <div className="absolute right-0 top-full mt-2 z-30 rounded-2xl overflow-hidden"
                    style={{ background: 'var(--popover-bg)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', width: '260px' }}>
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <p className="text-sm font-semibold">Notifications</p>
                    </div>
                    <div className="px-4 py-6 text-center">
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No notifications yet</p>
                    </div>
                  </div>
                )}
              </div>
              {/* Avatar */}
              <Avatar name={user?.name} email={user?.email} src={user?.avatarUrl} size={32} rounded={12} />
              {/* New manual transaction */}
              <button onClick={() => { setManualTxError(''); setShowManualTx(true); }}
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-all hover:brightness-110"
                style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-green) 28%, transparent)', color: 'var(--color-green)' }}>
                <PlusIcon /> New
              </button>
              {/* Import CSV */}
              <div className="relative" ref={importBtnRef}>
                <button onClick={() => { setShowImportPicker((v) => !v); setShowAddAccForm(false); setAddAccError(''); }}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-all hover:brightness-110"
                  style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 28%, transparent)', color: 'var(--color-primary)' }}>
                  <UploadIcon /> Import Transactions (CSV)
                </button>
                {showImportPicker && (
                  <div className="absolute right-0 top-full mt-2 z-30 rounded-2xl overflow-hidden"
                    style={{
                      background: 'var(--popover-bg)',
                      border: 'var(--glass-border)',
                      boxShadow: 'var(--glass-shadow)',
                      minWidth: '280px',
                    }}>

                    {!showAddAccForm ? (
                      /* ── Account list ── */
                      <>
                        {/* File-first entry: auto-detect account */}
                        <button
                          onClick={() => { setShowFileImport(true); setShowImportPicker(false); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:brightness-110"
                          style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-primary)' }}
                        >
                          <UploadIcon />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">Import a file — auto-detect account</p>
                            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Drop a CSV; we&apos;ll find the right account</p>
                          </div>
                        </button>
                        <div className="px-4 pt-3.5 pb-2 flex items-center gap-2"
                          style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <span className="text-[10px] font-bold tracking-widest uppercase flex-1"
                            style={{ color: 'color-mix(in srgb, var(--color-primary) 80%, transparent)' }}>Select account to import into</span>
                        </div>

                        {(() => {
                          const importableAccounts = accounts.filter((a) => isImportable(a.accountType));
                          return importableAccounts.length === 0 ? (
                          <p className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            No bank accounts yet — create one below.
                          </p>
                        ) : (
                          <div className="py-1.5">
                            {importableAccounts.map((a) => {
                              const c = a.color || '#9B6DFF';
                              return (
                                <button key={a.id}
                                  onClick={() => { setImportAccount(a); setShowImportPicker(false); }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all group"
                                  style={{ borderLeft: '3px solid transparent' }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${c}12`; (e.currentTarget as HTMLElement).style.borderLeftColor = `${c}80`; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent'; }}>
                                  {/* Composite icon: bank logo + type badge — mirrors the account cards */}
                                  {(() => {
                                    const bankMeta = BANKS.find((b) => b.name === a.bankName);
                                    const isCash   = a.accountType === 'cash';
                                    return (
                                      <div className="relative shrink-0" style={{ width: 32, height: 32 }}>
                                        <div className="w-full h-full rounded-xl flex items-center justify-center overflow-hidden"
                                          style={{ background: isCash ? `${c}25` : 'white', border: `1px solid ${c}35` }}>
                                          {isCash ? (
                                            <span style={{ fontSize: 16 }}>💵</span>
                                          ) : bankMeta ? (
                                            <img
                                              src={`https://logo.clearbit.com/${bankMeta.domain}`}
                                              alt={a.bankName}
                                              width={22} height={22}
                                              style={{ objectFit: 'contain' }}
                                              onError={(e) => {
                                                e.currentTarget.src = `https://www.google.com/s2/favicons?domain=${bankMeta.domain}&sz=64`;
                                                e.currentTarget.style.background = 'transparent';
                                              }}
                                            />
                                          ) : (
                                            <AccountTypeIcon type={a.accountType} size={16} />
                                          )}
                                        </div>
                                        {!isCash && (
                                          <div className="absolute -bottom-1 -right-1 w-[17px] h-[17px] rounded-lg flex items-center justify-center"
                                            style={{ background: c, color: '#fff', border: '2px solid var(--popover-bg)' }}>
                                            <AccountTypeIcon type={a.accountType} size={10} />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{a.bankName}</p>
                                    <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{a.accountName}</p>
                                  </div>
                                  {(() => { const tc = accountTypeMeta(a.accountType).accent; return (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md capitalize shrink-0"
                                    style={{ background: `color-mix(in srgb, ${tc} 16%, transparent)`, color: tc, border: `1px solid color-mix(in srgb, ${tc} 32%, transparent)` }}>
                                    {a.accountType}
                                  </span>
                                  ); })()}
                                </button>
                              );
                            })}
                          </div>
                        );
                        })()}

                        <div style={{ borderTop: '1px solid var(--color-border)' }} />
                        <button
                          onClick={() => { setShowAddAccForm(true); setAddAccError(''); }}
                          className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-semibold transition-colors hover:bg-white/5"
                          style={{ color: 'var(--color-primary)' }}>
                          <span className="w-5 h-5 rounded-lg flex items-center justify-center text-sm"
                            style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)' }}>+</span>
                          Create new account
                        </button>
                      </>
                    ) : (
                      /* ── Inline add account form ── */
                      <form onSubmit={handleAddAccount} className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 px-4 py-3"
                          style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <button type="button" onClick={() => { setShowAddAccForm(false); setAddAccError(''); }}
                            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)]"
                            style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
                            ←
                          </button>
                          <p className="text-xs font-bold flex-1" style={{ color: 'var(--color-text-primary)' }}>New Account</p>
                        </div>

                        <div className="px-4 flex flex-col gap-2.5 pb-4">
                        <BankSelect
                          value={newAcc.bankName}
                          onChange={(v: string) => setNewAcc((f) => ({ ...f, bankName: v }))}
                          compact
                          inputStyle={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)' }}
                        />

                        <input required placeholder="Account name (e.g. Checking)" value={newAcc.accountName}
                          onChange={(e) => setNewAcc((f) => ({ ...f, accountName: e.target.value }))}
                          className="w-full px-3 py-2 text-xs rounded-lg outline-none"
                          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />

                        <div className="flex gap-2">
                          {/* Custom account type dropdown */}
                          <div className="flex-1 relative">
                            <button type="button" onClick={() => setNewAccTypeOpen((o) => !o)}
                              className="w-full px-2 py-2 text-xs rounded-lg flex items-center justify-between gap-1"
                              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                              <span>{accountTypeLabel(newAcc.accountType)}</span>
                              <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0 }}>
                                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                            {newAccTypeOpen && (
                              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-y-auto z-50"
                                style={{ background: 'var(--popover-bg)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', maxHeight: '240px' }}>
                                {ACCOUNT_GROUPS.map((grp) => (
                                  <div key={grp.group}>
                                    <p className="px-3 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-widest"
                                      style={{ color: 'var(--color-text-muted)' }}>{grp.label}</p>
                                    {grp.types.map((meta) => {
                                      const val = meta.value;
                                      return (
                                        <button key={val} type="button"
                                          onClick={() => { setNewAcc((f) => ({ ...f, accountType: val })); setNewAccTypeOpen(false); }}
                                          className="w-full px-3 py-2 text-xs text-left transition-colors flex items-center gap-2"
                                          style={{ background: newAcc.accountType === val ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'transparent', color: newAcc.accountType === val ? 'var(--color-primary)' : 'var(--color-text-primary)' }}
                                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-elevated)')}
                                          onMouseLeave={(e) => (e.currentTarget.style.background = newAcc.accountType === val ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'transparent')}>
                                          <AccountTypeIcon type={val} size={14} />{meta.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <select value={newAcc.currency} onChange={(e) => setNewAcc((f) => ({ ...f, currency: e.target.value }))}
                            className="px-2 py-2 text-xs rounded-lg outline-none appearance-none"
                            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                            {['USD','EUR','GBP','MXN','BRL','CAD'].map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </div>

                        {/* Color swatches */}
                        <div className="flex items-center gap-2">
                          {ACC_COLORS.map((c) => (
                            <button key={c} type="button" onClick={() => setNewAcc((f) => ({ ...f, color: c }))}
                              className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
                              style={{ background: c, outline: newAcc.color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
                          ))}
                        </div>

                        {/* Opening balance */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold"
                            style={{ color: 'var(--color-text-muted)' }}>
                            {newAcc.accountType === 'loan' ? 'Amount currently owed to you' : 'Opening balance'}{' '}
                            <span className="opacity-50">(optional)</span>
                          </label>
                          <input
                            type="number" min="0" step="0.01" placeholder="0.00"
                            value={newAcc.openingBalance}
                            onChange={(e) => setNewAcc((f) => ({ ...f, openingBalance: e.target.value }))}
                            className="w-full px-3 py-2 text-xs rounded-lg outline-none"
                            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                        </div>

                        {addAccError && (
                          <p className="text-[10px]" style={{ color: 'var(--color-rose)' }}>{addAccError}</p>
                        )}

                        <button type="submit" disabled={addingAcc}
                          className="w-full py-2.5 text-xs font-bold rounded-xl transition-all hover:brightness-110 disabled:opacity-50"
                          style={{ background: 'var(--color-card-violet)', color: 'white' }}>
                          {addingAcc ? 'Creating…' : 'Create & Import'}
                        </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* Sync (Plaid only) */}
              {hasPlaid && (
                <button onClick={syncAll} disabled={syncing}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)', color: 'var(--color-green)' }}>
                  <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                    <SyncIcon />
                  </span>
                  {syncing ? 'Syncing…' : 'Sync Plaid'}
                </button>
              )}
            </div>
          </div>

          {/* ── Date range selector ── */}
          <div className="flex items-center gap-3 flex-wrap">
            {rangeMode === 'month' ? (
              <div className="flex items-center gap-1 p-1 rounded-xl"
                style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                <button onClick={() => setMonth(prevMonth(month))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--color-elevated)] text-lg leading-none"
                  style={{ color: 'var(--color-text-secondary)' }}>‹</button>
                <span className="px-3 text-sm font-semibold min-w-36 text-center">{monthLabel(month)}</span>
                <button onClick={() => setMonth(nextMonth(month))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--color-elevated)] text-lg leading-none"
                  style={{ color: 'var(--color-text-secondary)' }}>›</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-xl outline-none"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-xl outline-none"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
              </div>
            )}
            <button onClick={() => setRangeMode((m) => m === 'month' ? 'custom' : 'month')}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--color-elevated)]"
              style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
              {rangeMode === 'month' ? '📅 Custom range' : '← Month view'}
            </button>

          </div>

          {/* ── Stat strip ── */}
          <StatStrip
            transactions={transactions}
            prev={prevTransactions}
            recurringNow={recurringNowTotal}
            recurringPrev={recurringPrevTotal}
            prevLabel={prevRange?.label ?? 'prior period'}
            loading={loading}
          />

          {/* ── Search + filters ── */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-44">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--color-text-muted)' }}><SearchIcon /></span>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search merchants or notes"
                className="w-full pl-9 pr-3 py-2 text-sm outline-none rounded-xl"
                style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
            </div>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
              aria-label="Sort transactions"
              className="px-3 py-2 text-xs font-semibold rounded-xl outline-none cursor-pointer"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <option value="date-desc">Sort: Date (newest)</option>
              <option value="date-asc">Sort: Date (oldest)</option>
              <option value="amount-desc">Sort: Amount (high → low)</option>
              <option value="amount-asc">Sort: Amount (low → high)</option>
            </select>
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
              aria-label="Filter by account"
              className="px-3 py-2 text-xs font-semibold rounded-xl outline-none cursor-pointer max-w-52 truncate"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <option value="all">Account: All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.bankName} · {a.accountName}</option>
              ))}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
              className="px-3 py-2 text-xs font-semibold rounded-xl outline-none cursor-pointer max-w-48 truncate"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <option value="all">Category: All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
            {(search || accountFilter !== 'all' || categoryFilter !== 'all' || sortMode !== 'date-desc') && (
              <button
                onClick={() => { setSearch(''); setAccountFilter('all'); setCategoryFilter('all'); setSortMode('date-desc'); }}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-[var(--color-elevated)]"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                title="Clear search, sort and filters">
                <SlidersIcon />
              </button>
            )}
          </div>

          {/* ── Status tabs ── */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1 p-1 rounded-xl"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              {([
                { id: 'all',       label: 'All',       count: transactions.length },
                { id: 'expense',   label: 'Expenses',  count: transactions.filter((t) => Number(t.amount) < 0).length },
                { id: 'income',    label: 'Income',    count: transactions.filter((t) => Number(t.amount) >= 0).length },
                { id: 'recurring', label: 'Recurring', count: transactions.filter(isRecurringTx).length },
              ] as { id: Filter; label: string; count: number }[]).map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={filter === f.id
                    ? { background: 'color-mix(in srgb, var(--color-primary) 22%, transparent)', color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)' }
                    : { color: 'var(--color-text-secondary)', border: '1px solid transparent' }}>
                  {f.label}
                  <span className="opacity-50">{f.count}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setFilter('uncategorized')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:brightness-110"
                style={{
                  ...(uncategorizedCount > 0
                    ? { background: 'color-mix(in srgb, var(--color-amber) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-amber) 30%, transparent)', color: 'var(--color-amber)' }
                    : { background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)', color: 'var(--color-green)' }),
                  ...(filter === 'uncategorized' ? { boxShadow: `0 0 0 1px ${uncategorizedCount > 0 ? 'var(--color-amber)' : 'var(--color-green)'}` } : {}),
                }}>
                {uncategorizedCount > 0 ? '● ' : '✓ '}{uncategorizedCount} uncategorized
              </button>
              <button onClick={() => setFilter('all')}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {transactions.length} total
              </button>
            </div>
          </div>
        </div>

        {/* ── Transaction list ── */}
        <div className="px-6 py-5 flex flex-col gap-4">

          {/* Expand / Collapse all */}
          {accountGroups.length > 1 && (
            <div className="flex justify-end">
              <button
                onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(accountGroups.map(([id]) => id)))}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--color-elevated)]"
                style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                {allCollapsed ? '↓ Expand all' : '↑ Collapse all'}
              </button>
            </div>
          )}

          {loading ? (
            <p className="py-16 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading transactions…</p>
          ) : accountGroups.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-center"
              style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
              <span className="text-4xl">💸</span>
              <p className="font-semibold">No transactions found</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {filter === 'uncategorized'
                  ? '✅ All transactions in this period are categorized!'
                  : 'Import a CSV or connect a bank account to get started.'}
              </p>
              {filter !== 'all' && (
                <button onClick={() => setFilter('all')}
                  className="mt-1 text-sm px-3 py-1.5 rounded-lg"
                  style={{ color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)' }}>
                  Clear filter
                </button>
              )}
            </div>
          ) : (
            accountGroups.map(([accountId, txList]) => {
              const acc        = txList[0]?.bankAccount;
              const isCollapsed = collapsed.has(accountId);
              const accIncome       = txList.filter((t) => Number(t.amount) >= 0 && !isTransfer(t)).reduce((s, t) => s + Number(t.amount), 0);
              const accExpense      = txList.filter((t) => Number(t.amount) < 0  && !isTransfer(t)).reduce((s, t) => s + Number(t.amount), 0);
              const accUncategorized = txList.filter((t) => !t.categoryId && !t.projectId && !isTransfer(t)).length;
              const accColor        = acc?.color || '#9B6DFF';

              const dateMap = txList.reduce<Record<string, Transaction[]>>((m, tx) => {
                (m[tx.date] ??= []).push(tx); return m;
              }, {});
              const dates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a));

              return (
                <div key={accountId} className="flex flex-col gap-2">

                  {/* ── Account header ── */}
                  <button
                    onClick={() => toggleCollapse(accountId)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-all hover:brightness-110"
                    style={{
                      background: `linear-gradient(135deg, ${accColor}14 0%, var(--color-surface) 100%)`,
                      backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
                      border: `1px solid ${accColor}35`,
                      boxShadow: `0 4px 24px rgba(0,0,0,0.3), inset 0 0 0 1px ${accColor}10`,
                    }}>

                    {/* Composite icon: bank logo + type badge */}
                    {(() => {
                      const bankMeta = BANKS.find((b) => b.name === acc?.bankName);
                      const isCash   = acc?.accountType === 'cash';
                      return (
                        <div className="relative shrink-0" style={{ width: 38, height: 38 }}>
                          {/* Main bank logo or cash icon */}
                          <div className="w-full h-full rounded-xl flex items-center justify-center overflow-hidden"
                            style={{ background: isCash ? `${accColor}25` : 'white', border: `1px solid ${accColor}30` }}>
                            {isCash ? (
                              <span style={{ fontSize: 20 }}>💵</span>
                            ) : bankMeta ? (
                              <img
                                src={`https://logo.clearbit.com/${bankMeta.domain}`}
                                alt={acc?.bankName}
                                width={28} height={28}
                                style={{ objectFit: 'contain' }}
                                onError={(e) => {
                                  e.currentTarget.src = `https://www.google.com/s2/favicons?domain=${bankMeta.domain}&sz=64`;
                                  e.currentTarget.style.background = 'transparent';
                                }}
                              />
                            ) : (
                              <AccountTypeIcon type={acc?.accountType ?? ''} size={20} />
                            )}
                          </div>
                          {/* Type badge overlay — bottom-right */}
                          {!isCash && acc?.accountType && (
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-lg flex items-center justify-center"
                              style={{ background: accColor, border: '2px solid rgba(15,15,24,0.9)' }}>
                              <AccountTypeIcon type={acc.accountType} size={11} />
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{acc?.bankName ?? 'Unknown Bank'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                          {acc?.accountName}
                        </p>
                        {acc?.accountType && (() => { const tc = accountTypeMeta(acc.accountType).accent; return (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 capitalize"
                            style={{ background: `color-mix(in srgb, ${tc} 18%, transparent)`, color: tc, border: `1px solid color-mix(in srgb, ${tc} 38%, transparent)` }}>
                            {acc.accountType}
                          </span>
                          ); })()}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {accIncome > 0 && (
                        <span className="text-xs font-semibold hidden sm:block" style={{ color: 'var(--color-green)' }}>
                          +${accIncome.toFixed(2)}
                        </span>
                      )}
                      {accExpense < 0 && (
                        <span className="text-xs font-semibold hidden sm:block" style={{ color: 'var(--color-orange)' }}>
                          -${Math.abs(accExpense).toFixed(2)}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
                        {txList.length}
                      </span>
                      {accUncategorized > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: 'color-mix(in srgb, var(--color-amber) 15%, transparent)', color: 'var(--color-amber)' }}>
                          {accUncategorized} uncat.
                        </span>
                      )}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                        strokeLinecap="round" strokeLinejoin="round"
                        style={{ color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </button>

                  {/* ── Date groups (shown when expanded) ── */}
                  {!isCollapsed && (
                  <div className="relative flex flex-col gap-2" style={{ paddingLeft: '28px' }}>
                    {/* Main vertical trunk line on the far left */}
                    <div className="absolute pointer-events-none"
                      style={{
                        left: '10px',
                        top: 0,
                        bottom: '16px',
                        width: '2px',
                        background: `linear-gradient(to bottom, ${accColor}80, ${accColor}08)`,
                        borderRadius: '1px',
                      }} />
                  {dates.map((date, dateIdx) => {
                    const dateKey       = `${accountId}::${date}`;
                    const dateCollapsed = collapsedDates.has(dateKey);
                    const dayUncategorized = dateMap[date].filter((t) => !t.categoryId && !t.projectId && !isTransfer(t)).length;
                    const isLast = dateIdx === dates.length - 1;
                    return (
                    <div key={date} className="relative">
                      {/* Curved branch connector: down from trunk then right */}
                      <div className="absolute pointer-events-none"
                        style={{
                          left: '-18px',
                          top: '0',
                          width: '16px',
                          height: '14px',
                          borderLeft: `2px solid ${accColor}${isLast ? '40' : '60'}`,
                          borderBottom: `2px solid ${accColor}60`,
                          borderBottomLeftRadius: '10px',
                        }} />
                      {/* Date header — collapsible */}
                      <button
                        onClick={() => toggleCollapseDate(dateKey)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 mb-1 rounded-lg transition-colors hover:bg-white/5 text-left">
                        <span className="text-[10px] font-bold tracking-wider uppercase flex-1"
                          style={{ color: 'var(--color-text-muted)' }}>
                          {formatDate(date)}
                        </span>
                        {dayUncategorized > 0 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                            style={{ background: 'color-mix(in srgb, var(--color-amber) 12%, transparent)', color: 'var(--color-amber)' }}>
                            {dayUncategorized} uncat.
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md"
                          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
                          {dateMap[date].length}
                        </span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                          strokeLinecap="round" strokeLinejoin="round"
                          style={{ color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: dateCollapsed ? 'rotate(-90deg)' : 'none', flexShrink: 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {!dateCollapsed && (
                      <div className="flex flex-col overflow-hidden"
                        style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
                        {dateMap[date].map((tx, i) => {
                        const amount       = Number(tx.amount);
                        const isIncome     = amount >= 0;
                        const cat          = tx.categoryRef;
                        const txIsTransfer = isTransfer(tx);
                        const isOpen       = openPickerId === tx.id;
                        const primaryType   = isIncome ? 'income' : 'expense';
                        const secondaryType = isIncome ? 'expense' : 'income';
                        const searchQ       = pickerSearch.toLowerCase();
                        const pickerCats    = categories.filter((c) => (c.type === primaryType || c.type === 'transfer') && (!searchQ || c.name.toLowerCase().includes(searchQ)));
                        const pickerCatsAlt = categories.filter((c) => c.type === secondaryType && (!searchQ || c.name.toLowerCase().includes(searchQ)));
                        const needsCategory = !tx.categoryId && !tx.projectId && !tx.debtId && !txIsTransfer;

                        /* What the row's action cluster is allowed to offer. A split
                           parent must be recombined before it can be deleted, and
                           editing stays manual-only: a materialised recurring
                           occurrence would silently drift from the rule behind it. */
                        const canDelete  = DELETABLE_SOURCES.has(tx.source) && !tx.isSplitParent;
                        const canEdit    = tx.source === 'manual';
                        const canSplit   = !tx.debtId && !txIsTransfer && !tx.parentId;
                        const canUnsplit = !tx.debtId && !txIsTransfer && !!tx.parentId;
                        /* Everything else moved into the cluster, so the ⋮ now has
                           content only for a rule-categorized row. Without this it
                           would open an empty popover on most rows. */
                        const hasRowMenu = !!tx.categorizedByRuleId;

                        return (
                          <div key={tx.id} className="relative group cursor-pointer"
                            style={{
                              ...(i > 0 ? { borderTop: '1px solid var(--color-border)' } : {}),
                              ...(needsCategory ? {
                                boxShadow: 'inset 3px 0 0 0 var(--color-amber)',
                                background: 'color-mix(in srgb, var(--color-amber) 3%, transparent)',
                              } : {}),
                              ...(selectedTx?.id === tx.id ? { background: 'color-mix(in srgb, var(--color-primary) 6%, transparent)' } : {}),
                            }}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('button,input,textarea,select,[role="button"]')) return;
                              setSelectedTx((prev) => prev?.id === tx.id ? null : tx);
                            }}>
                            <div className="flex items-center gap-3 px-4 py-3">

                              {/* Category icon chip (direction color fallback) */}
                              {(() => {
                                const chipColor = tx.parentId ? 'var(--color-primary)'
                                  : txIsTransfer ? '#6B6B8A'
                                  : needsCategory ? 'var(--color-amber)'
                                  : cat?.color || (isIncome ? 'var(--color-green)' : 'var(--color-orange)');
                                return (
                                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[15px] shrink-0"
                                    style={{
                                      background: `color-mix(in srgb, ${chipColor} ${needsCategory ? 8 : 14}%, transparent)`,
                                      border: `1px ${needsCategory ? 'dashed' : 'solid'} color-mix(in srgb, ${chipColor} ${needsCategory ? 45 : 30}%, transparent)`,
                                    }}>
                                    {cat?.icon
                                      ? <span aria-hidden="true">{cat.icon}</span>
                                      : <span className="font-bold text-xs" style={{ color: chipColor }}>{txIsTransfer ? '⇄' : isIncome ? '↑' : '↓'}</span>}
                                  </span>
                                );
                              })()}

                              {/* Name + source */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate leading-snug">{tx.name}</p>
                                {tx.note && (
                                  <p className="text-[11px] truncate leading-snug" style={{ color: 'var(--color-text-muted)' }}>{tx.note}</p>
                                )}
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {tx.parentId ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                      style={{ background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 28%, transparent)', color: 'var(--color-primary)' }}>
                                      ✂ Split
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase"
                                      style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
                                      {tx.source}
                                    </span>
                                  )}
                                  {tx.pending && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                      style={{ background: 'color-mix(in srgb, var(--color-amber) 12%, transparent)', color: 'var(--color-amber)' }}>
                                      Pending
                                    </span>
                                  )}
                                  {tx.categorizedByRuleId && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                      title={tx.categorizedByRule ? `Categorized by rule: ${tx.categorizedByRule.matchValue}` : 'Categorized by a rule'}
                                      style={{ background: 'color-mix(in srgb, var(--color-card-violet) 12%, transparent)', color: 'var(--color-card-violet)' }}>
                                      📌 Rule
                                    </span>
                                  )}
                                  {tx.projectId ? (() => {
                                    const proj = projects.find((p) => p.id === tx.projectId);
                                    if (!proj) return null;
                                    const c    = proj.color || '#9B6DFF';
                                    const pCat = tx.projectCategoryId
                                      ? proj.categories?.find((cat) => cat.id === tx.projectCategoryId)
                                      : null;
                                    return (
                                      <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                        style={{ background: `${c}18`, border: `1px solid ${c}35`, color: c }}>
                                        <span>{proj.icon}</span>
                                        <span className="max-w-20 truncate">{proj.name}</span>
                                        {pCat && <><span className="opacity-40">·</span><span>{pCat.icon}</span><span className="max-w-16 truncate" style={{ color: pCat.color }}>{pCat.name}</span></>}
                                      </span>
                                    );
                                  })() : null}
                                  {tx.categoryRef?.type === 'transfer' && (
                                    <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                                      style={{ background: 'rgba(107,107,138,0.15)', border: '1px solid rgba(107,107,138,0.30)', color: '#9B9BB8' }}>
                                      <span>
                                        {Number(tx.amount) >= 0
                                          ? <>{tx.transferAccount?.accountName ?? '?'} → {tx.bankAccount?.accountName ?? '?'}</>
                                          : <>{tx.bankAccount?.accountName ?? '?'} → {tx.transferAccount?.accountName ?? '?'}</>
                                        }
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>

                          {/* ── Category suggestion ── */}
                          {(() => {
                            if (tx.categoryId || tx.projectId || tx.debtId || txIsTransfer) return null;
                            // 1. Normalize name: strip trailing unique codes like "WFCT126NB7CP"
                            const normName = tx.name.replace(/\s+(?:conf#\S+|[A-Z0-9]{6,})$/i, '').trim();
                            // 2. Past-history hints
                            const pastHint = categoryHints[tx.name] ?? categoryHints[normName]
                              ?? Object.entries(categoryHints).find(([k]) => normName && k.toLowerCase().startsWith(normName.toLowerCase()))?.[1]
                              ?? null;
                            // 3. Pattern-based hints for common transaction types
                            const patternHint = (() => {
                              const n = tx.name.toLowerCase();
                              const find = (name: string) => { const c = categories.find(x => x.name === name); return c ? { id: c.id, name: c.name, icon: c.icon, color: c.color } : null; };
                              if (/payment to .+card|loan_pmt|credit card payment/i.test(tx.name)) return find('Credit Card Payment');
                              if (/zelle payment to |transfer to /i.test(tx.name) && amount < 0) return find('Internal Transfer');
                              if (/zelle payment from |transfer from /i.test(tx.name) && amount > 0) return find('Reimbursement');
                              if (/monthly service fee|service fee|bank fee|overdraft/i.test(n)) return find('Subscriptions');
                              if (/payroll|direct deposit|salary/i.test(n) && amount > 0) return find('Salary');
                              if (/amazon|amzn/i.test(n)) return find('Shopping');
                              if (/uber|lyft|doordash|grubhub/i.test(n) && amount < 0) return find('Transport');
                              if (/netflix|spotify|apple\.com\/bill|hulu|disney/i.test(n)) return find('Subscriptions');
                              if (/wholefds|whole foods|publix|kroger|trader joe/i.test(n)) return find('Groceries');
                              if (/chevron|shell|bp |exxon|sunoco|marathon|fuel|gas station|sunpass/i.test(n)) return find('Transport');
                              if (/mcdonald|burger king|wendy|chipotle|starbucks|dunkin/i.test(n)) return find('Food & Dining');
                              return null;
                            })();
                            const hint = pastHint ?? patternHint;
                            if (!hint) return null;
                            return (
                              <button
                                onClick={() => assignCategory(tx.id, hint.id)}
                                disabled={updatingId === tx.id}
                                title={`Apply past category: ${hint.name}`}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all hover:brightness-125 disabled:opacity-40"
                                style={{ background: `${hint.color}14`, border: `1px solid ${hint.color}38`, color: hint.color }}>
                                <span>{hint.icon}</span>
                                <span className="max-w-24 truncate">{hint.name}</span>
                                <span className="text-[9px] opacity-55 font-normal shrink-0">✓ apply</span>
                              </button>
                            );
                          })()}

                          {/* ── Project category suggestion ── */}
                          {(() => {
                            const ph = pickProjectSuggestion(tx, projectHints, txIsTransfer);
                            if (!ph) return null;
                            const proj = projects.find((p) => p.id === ph.projectId);
                            if (!proj) return null;
                            return (
                              <button
                                onClick={() => linkToProject(tx.id, ph.projectId, ph.projectCategoryId)}
                                disabled={updatingId === tx.id || linkingProj}
                                title={`Link to ${proj.name} → ${ph.catName}`}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all hover:brightness-125 disabled:opacity-40"
                                style={{ background: `${ph.catColor}14`, border: `1px solid ${ph.catColor}38`, color: ph.catColor }}>
                                <span>{proj.icon}</span>
                                <span className="max-w-20 truncate">{proj.name}</span>
                                <span className="opacity-50">·</span>
                                <span className="max-w-16 truncate">{ph.catName}</span>
                                <span className="text-[9px] opacity-55 font-normal shrink-0">✓ apply</span>
                              </button>
                            );
                          })()}

                          {/* Category picker */}
                          <div className="relative shrink-0">
                            <button
                              onMouseDown={(e) => { if (isOpen) e.stopPropagation(); }}
                              onClick={(e) => {
                                if (isOpen) { setOpenPickerId(null); setPickerProjectDrill(null); setPickerTransferStep(false); setPickerShowPurchasePrompt(false); return; }
                                setPickerPos(placePicker((e.currentTarget as HTMLButtonElement).getBoundingClientRect()));
                                setOpenPickerId(tx.id);
                                setPickerProjectDrill(null);
                                setPickerTransferStep(false);
                                setPickerSearch('');
                              }}
                              disabled={updatingId === tx.id}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:brightness-110 disabled:opacity-40"
                              style={(() => {
                                if (tx.debtId) return { background: 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)', color: 'var(--color-card-violet)' };
                                if (tx.projectId) {
                                  const _proj = projects.find((p) => p.id === tx.projectId);
                                  const _pCat = tx.projectCategoryId ? _proj?.categories?.find((c) => c.id === tx.projectCategoryId) : null;
                                  const _c = _pCat?.color || _proj?.color || '#9B6DFF';
                                  return { background: `${_c}18`, border: `1px solid ${_c}35`, color: _c };
                                }
                                if (cat) return { background: `${cat.color}18`, border: `1px solid ${cat.color}35`, color: cat.color };
                                return { background: 'color-mix(in srgb, var(--color-amber) 10%, transparent)', border: '1px dashed color-mix(in srgb, var(--color-amber) 45%, transparent)', color: 'var(--color-amber)' };
                              })()}>
                              {updatingId === tx.id ? (
                                <span>…</span>
                              ) : tx.debtId ? (
                                (() => {
                                  const linkedDebt = debts.find((d) => d.id === tx.debtId);
                                  return (
                                    <><span>🤝</span><span>
                                      {linkedDebt?.direction === 'owed' ? 'Debt payment · ' : 'Debt repayment · '}
                                      {linkedDebt?.borrowerName ?? 'debt'}
                                    </span></>
                                  );
                                })()
                              ) : tx.projectId ? (() => {
                                const _proj = projects.find((p) => p.id === tx.projectId);
                                const _pCat = tx.projectCategoryId ? _proj?.categories?.find((c) => c.id === tx.projectCategoryId) : null;
                                return _pCat
                                  ? <><span>{_pCat.icon}</span><span>{_pCat.name}</span><ChevronIcon /></>
                                  : <><span>{_proj?.icon}</span><span>{_proj?.name}</span><ChevronIcon /></>;
                              })() : cat ? (
                                <>
                                  <span>{cat.icon}</span>
                                  <span>{cat.name}</span>
                                  {cat.type === 'transfer' && (
                                    <span className="opacity-70">
                                      {Number(tx.amount) >= 0
                                        ? <>{tx.transferAccount?.accountName ?? '?'} → {tx.bankAccount?.accountName ?? '?'}</>
                                        : <>{tx.bankAccount?.accountName ?? '?'} → {tx.transferAccount?.accountName ?? '?'}</>
                                      }
                                    </span>
                                  )}
                                  <ChevronIcon />
                                </>
                              ) : (
                                <><TagIcon /><span>Categorize</span><ChevronIcon /></>
                              )}
                            </button>

                            {isOpen && pickerPos && createPortal(
                              <div ref={pickerRef} className="py-1 rounded-xl overflow-y-auto cat-picker"
                                style={{ ...glass, position: 'fixed', top: pickerPos.top, left: pickerPos.left, width: pickerPos.width, maxHeight: pickerPos.maxHeight, zIndex: 9999, transformOrigin: pickerPos.origin }}>
                                {cat && (
                                  <>
                                    <button onClick={() => assignCategory(tx.id, null)}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[var(--color-elevated)]"
                                      style={{ color: 'var(--color-rose)' }}>
                                      <span>✕</span><span>Remove category</span>
                                    </button>
                                    <div style={{ borderTop: '1px solid var(--color-border)' }} />
                                  </>
                                )}
                                {!pickerTransferStep && !pickerProjectDrill && (
                                  <div className="px-2 pt-1.5 pb-1">
                                    <input
                                      autoFocus
                                      placeholder="Search…"
                                      value={pickerSearch}
                                      onChange={(e) => setPickerSearch(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full px-2.5 py-1.5 text-xs outline-none rounded-lg"
                                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                                    />
                                  </div>
                                )}
                                {/* Remove debt link */}
                                {tx.debtId && !pickerTransferStep && !pickerProjectDrill && (
                                  <>
                                    <button
                                      onClick={() => assignDebt(tx.id, null)}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[var(--color-elevated)]"
                                      style={{ color: 'var(--color-rose)' }}>
                                      <span>✕</span><span>Remove debt link</span>
                                    </button>
                                    <div style={{ borderTop: '1px solid var(--color-border)' }} />
                                  </>
                                )}

                                {/* Debt payment section */}
                                {!pickerTransferStep && !pickerProjectDrill && (() => {
                                  const filteredDebts = openDebts.filter((d) =>
                                    !pickerSearch || d.borrowerName.toLowerCase().includes(pickerSearch.toLowerCase()),
                                  );
                                  if (!filteredDebts.length) return null;
                                  return (
                                    <>
                                      <p className="px-3 pt-2 pb-0.5 text-[10px] font-bold tracking-widest uppercase"
                                        style={{ color: 'var(--color-card-violet)' }}>Debt payment</p>
                                      {filteredDebts.map((d) => (
                                        <button key={d.id}
                                          onClick={() => assignDebt(tx.id, d.id)}
                                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors"
                                          style={{
                                            background: tx.debtId === d.id
                                              ? 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)'
                                              : 'transparent',
                                            color: tx.debtId === d.id ? 'var(--color-card-violet)' : 'var(--color-text-primary)',
                                          }}
                                          onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--color-card-violet) 12%, transparent)')}
                                          onMouseLeave={(e) => (e.currentTarget.style.background = tx.debtId === d.id
                                            ? 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)'
                                            : 'transparent')}>
                                          <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                            style={{ background: 'color-mix(in srgb, var(--color-card-violet) 20%, transparent)' }}>🤝</span>
                                          <span className="font-medium flex-1 text-left">{d.borrowerName}</span>
                                          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                            ${Number(d.remaining).toLocaleString('en-US', { minimumFractionDigits: 2 })} left
                                          </span>
                                        </button>
                                      ))}
                                      <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                                    </>
                                  );
                                })()}
                                {pickerTransferStep && openPickerId === tx.id ? (
                                  /* ── Transfer account picker ── */
                                  <>
                                    <div className="flex items-center gap-2 px-3 py-2"
                                      style={{ borderBottom: '1px solid var(--color-border)' }}>
                                      <button onClick={() => setPickerTransferStep(false)}
                                        className="text-sm hover:opacity-70 shrink-0"
                                        style={{ color: 'var(--color-text-muted)' }}>←</button>
                                      <span className="text-xs font-bold flex-1" style={{ color: '#6B6B8A' }}>
                                        {Number(tx.amount) >= 0 ? 'Money coming from…' : 'Money going to…'}
                                      </span>
                                    </div>
                                    {/* Suggested matching transactions */}
                                    {transferMatchesLoading && (
                                      <p className="px-3 py-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Finding matches…</p>
                                    )}
                                    {/* No matches — show credit card accounts as quick suggestions */}
                                    {!transferMatchesLoading && transferMatches.length === 0 && (() => {
                                      const creditAccs = accounts.filter((a) => isLiability(a.accountType) && a.id !== tx.bankAccountId);
                                      if (!creditAccs.length) return null;
                                      return (
                                        <>
                                          <p className="px-3 pt-2 pb-0.5 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1"
                                            style={{ color: 'var(--color-primary)' }}>
                                            <span>💳</span> Credit Cards
                                          </p>
                                          {creditAccs.map((a) => {
                                            const c = a.color || '#9B6DFF';
                                            const selected = tx.transferAccountId === a.id;
                                            return (
                                              <button key={a.id}
                                                onClick={() => setTransferAccount(tx.id, a.id)}
                                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors hover:bg-[var(--color-elevated)]"
                                                style={{ background: selected ? `${c}15` : `${c}06`, borderLeft: `2px solid ${c}50` }}>
                                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                                  style={{ background: `${c}20` }}>
                                                  <AccountTypeIcon type={a.accountType} size={16} />
                                                </span>
                                                <div className="flex-1 text-left min-w-0">
                                                  <p className="font-semibold truncate" style={{ color: selected ? c : 'var(--color-text-primary)' }}>{a.accountName}</p>
                                                  <p className="truncate" style={{ color: 'var(--color-text-muted)' }}>{a.bankName}</p>
                                                </div>
                                                {selected && <span style={{ color: c }}>✓</span>}
                                              </button>
                                            );
                                          })}
                                          <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                                          <p className="px-3 pb-0.5 text-[10px] font-bold tracking-widest uppercase"
                                            style={{ color: 'var(--color-text-muted)' }}>All accounts</p>
                                        </>
                                      );
                                    })()}
                                    {!transferMatchesLoading && transferMatches.length > 0 && (
                                      <>
                                        <p className="px-3 pt-2 pb-0.5 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1"
                                          style={{ color: 'var(--color-amber)' }}>
                                          <span>✦</span> Suggested Matches
                                        </p>
                                        {transferMatches.map((m) => {
                                          const acc  = m.bankAccount;
                                          const c    = acc?.color || '#9B6DFF';
                                          const selected = tx.transferAccountId === acc?.id;
                                          return (
                                            <button key={m.id}
                                              onClick={() => setTransferAccount(tx.id, acc?.id ?? null, m.id)}
                                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[var(--color-elevated)]"
                                              style={{ background: selected ? `${c}12` : 'color-mix(in srgb, var(--color-amber) 4%, transparent)', borderLeft: `2px solid ${c}60` }}>
                                              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                                style={{ background: `${c}20` }}>
                                                <AccountTypeIcon type={acc?.accountType ?? ''} size={18} />
                                              </span>
                                              <div className="flex-1 text-left min-w-0">
                                                <p className="font-semibold truncate" style={{ color: selected ? c : 'var(--color-text-primary)' }}>
                                                  {m.name}
                                                </p>
                                                <p className="truncate" style={{ color: 'var(--color-text-muted)' }}>
                                                  {acc?.bankName} · {acc?.accountName} · {m.date}
                                                </p>
                                              </div>
                                              <div className="text-right shrink-0">
                                                <p className="font-bold tabular-nums" style={{ color: Number(m.amount) >= 0 ? 'var(--color-green)' : 'var(--color-orange)' }}>
                                                  {Number(m.amount) >= 0 ? '+' : ''}{Number(m.amount).toFixed(2)}
                                                </p>
                                                <p className="text-[9px]" style={{ color: 'var(--color-amber)' }}>auto-link both</p>
                                              </div>
                                            </button>
                                          );
                                        })}
                                        <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                                        <p className="px-3 pb-0.5 text-[10px] font-bold tracking-widest uppercase"
                                          style={{ color: 'var(--color-text-muted)' }}>Or pick account manually</p>
                                      </>
                                    )}

                                    <button
                                      onClick={() => setTransferAccount(tx.id, null)}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[var(--color-elevated)]"
                                      style={!tx.transferAccountId ? { background: 'rgba(107,107,138,0.12)' } : {}}>
                                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                        style={{ background: 'var(--color-elevated)' }}>🏷️</span>
                                      <span className="flex-1 text-left" style={{ color: 'var(--color-text-secondary)' }}>
                                        External / Unknown
                                      </span>
                                      {!tx.transferAccountId && <span style={{ color: '#6B6B8A' }}>✓</span>}
                                    </button>
                                    {accounts.filter((a) => a.id !== tx.bankAccountId).map((acc) => {
                                      const c = acc.color || '#9B6DFF';
                                      const selected = tx.transferAccountId === acc.id;
                                      return (
                                        <button key={acc.id}
                                          onClick={() => setTransferAccount(tx.id, acc.id)}
                                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[var(--color-elevated)]"
                                          style={selected ? { background: `${c}12` } : {}}>
                                          <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                            style={{ background: `${c}20` }}>
                                            <AccountTypeIcon type={acc.accountType} size={16} />
                                          </span>
                                          <div className="flex-1 text-left min-w-0">
                                            <p className="font-medium truncate" style={{ color: selected ? c : 'var(--color-text-primary)' }}>
                                              {acc.accountName}
                                            </p>
                                            <p className="truncate" style={{ color: 'var(--color-text-muted)' }}>{acc.bankName}</p>
                                          </div>
                                          {selected && <span style={{ color: c }}>✓</span>}
                                        </button>
                                      );
                                    })}
                                  </>
                                ) : !pickerProjectDrill ? (
                                  /* ── Normal categories ── */
                                  <>
                                    {pickerCats.map((c) => (
                                      <button key={c.id} onClick={() => {
                                        const isTransfer = c.type === 'transfer';
                                        setPickerProjectDrill(null);
                                        if (isTransfer) {
                                          setOpenPickerId(null);
                                          setTransferModal({ tx, categoryId: c.id });
                                          setTransferModalMatches([]);
                                          setTransferModalLoading(true);
                                          fetch(`${API}/transactions/matches?amount=${tx.amount}&date=${tx.date}&excludeAccountId=${tx.bankAccountId}`, { credentials: 'include' })
                                            .then((r) => r.json())
                                            .then((m) => { if (Array.isArray(m)) setTransferModalMatches(m); })
                                            .catch(() => undefined)
                                            .finally(() => setTransferModalLoading(false));
                                        } else {
                                          assignCategory(tx.id, c.id);
                                        }
                                      }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors hover:bg-[var(--color-elevated)]"
                                        style={tx.categoryId === c.id ? { background: `${c.color}15` } : {}}>
                                        <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                          style={{ background: `${c.color}20` }}>{c.icon}</span>
                                        <span className="font-medium flex-1 text-left"
                                          style={{ color: tx.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}>
                                          {c.name}
                                        </span>
                                        {c.type === 'transfer' && (
                                          <span className="text-[9px] px-1 py-0.5 rounded shrink-0"
                                            style={{ background: 'rgba(107,107,138,0.2)', color: '#6B6B8A' }}>→ acct</span>
                                        )}
                                        {tx.categoryId === c.id && <span style={{ color: c.color }}>✓</span>}
                                      </button>
                                    ))}

                                    {/* Secondary type (e.g. expense categories for a positive/refund transaction) */}
                                    {pickerCatsAlt.length > 0 && (
                                      <>
                                        <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                                        <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold tracking-widest uppercase"
                                          style={{ color: 'var(--color-text-muted)' }}>
                                          {isIncome ? 'Refund / Expense' : 'Income'}
                                        </p>
                                        {pickerCatsAlt.map((c) => (
                                          <button key={c.id} onClick={() => assignCategory(tx.id, c.id)}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors hover:bg-[var(--color-elevated)]"
                                            style={tx.categoryId === c.id ? { background: `${c.color}15` } : {}}>
                                            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                              style={{ background: `${c.color}20` }}>{c.icon}</span>
                                            <span className="font-medium flex-1 text-left"
                                              style={{ color: tx.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}>
                                              {c.name}
                                            </span>
                                            {tx.categoryId === c.id && <span style={{ color: c.color }}>✓</span>}
                                          </button>
                                        ))}
                                      </>
                                    )}

                                    {/* Projects section */}
                                    {projects.length > 0 && (
                                      <>
                                        <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                                        <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold tracking-widest uppercase"
                                          style={{ color: 'var(--color-text-muted)' }}>Projects</p>
                                        {projects.map((proj) => {
                                          const c = proj.color || '#9B6DFF';
                                          const linked = tx.projectId === proj.id;
                                          return (
                                            <button key={proj.id}
                                              onClick={() => setPickerProjectDrill(proj.id)}
                                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[var(--color-elevated)]"
                                              style={linked ? { background: `${c}12` } : {}}>
                                              <ProjectAvatar project={proj} size={24} />
                                              <span className="flex-1 font-medium text-left truncate"
                                                style={{ color: linked ? c : 'var(--color-text-primary)' }}>
                                                {proj.name}
                                              </span>
                                              {linked && <span className="text-[10px] shrink-0" style={{ color: c }}>✓</span>}
                                              <span className="text-[10px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>▶</span>
                                            </button>
                                          );
                                        })}
                                      </>
                                    )}

                                    <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                                    <button
                                      onClick={() => { setOpenPickerId(null); setPickerProjectDrill(null); setNewCatForTxId(tx.id); setShowNewCatModal(true); }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold transition-colors hover:bg-[var(--color-elevated)]"
                                      style={{ color: 'var(--color-primary)' }}>
                                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                        style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)' }}>+</span>
                                      New category
                                    </button>
                                  </>
                                ) : pickerProjectDrill ? (
                                  /* ── Project category drill-down ── */
                                  (() => {
                                    const proj = projects.find((p) => p.id === pickerProjectDrill)!;
                                    const c = proj?.color || '#9B6DFF';
                                    return (
                                      <>
                                        {/* Header */}
                                        <div className="flex items-center gap-2 px-3 py-2"
                                          style={{ borderBottom: '1px solid var(--color-border)' }}>
                                          <button onClick={() => { setPickerProjectDrill(null); setMarkAsSaleConfirm(null); setPickerShowPurchasePrompt(false); }}
                                            className="text-sm hover:opacity-70 shrink-0"
                                            style={{ color: 'var(--color-text-muted)' }}>←</button>
                                          {proj && <ProjectAvatar project={proj} size={28} />}
                                          <span className="text-xs font-bold flex-1 truncate" style={{ color: c }}>{proj?.name}</span>
                                          {tx.projectId === pickerProjectDrill && (
                                            <button
                                              onClick={() => unlinkFromProject(tx.id, pickerProjectDrill!)}
                                              disabled={linkingProj}
                                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded hover:brightness-110 disabled:opacity-50 shrink-0"
                                              style={{ background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)', color: 'var(--color-rose)', border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)' }}>
                                              Unlink
                                            </button>
                                          )}
                                        </div>
                                        {/* Purchase prompt — shown when user clicked the initial purchase flow */}
                                        {pickerShowPurchasePrompt ? (
                                          <div className="px-3 py-3 flex flex-col gap-3">
                                            <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                              How should we record this?
                                            </p>
                                            <button
                                              onClick={() => { setPickerShowPurchasePrompt(false); linkToProject(tx.id, pickerProjectDrill!, null); }}
                                              disabled={linkingProj}
                                              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs text-left transition-colors hover:bg-(--color-elevated) disabled:opacity-50"
                                              style={{ border: '1px solid var(--color-border)' }}>
                                              <span className="text-base">📂</span>
                                              <div>
                                                <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Project expense</p>
                                                <p style={{ color: 'var(--color-text-muted)' }}>Added to ongoing costs</p>
                                              </div>
                                            </button>
                                            <button
                                              onClick={() => markAsPurchase(tx.id, pickerProjectDrill!)}
                                              disabled={linkingProj}
                                              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs text-left transition-colors disabled:opacity-50"
                                              style={{ border: '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)', background: 'color-mix(in srgb, var(--color-card-violet) 10%, transparent)' }}>
                                              <span className="text-base">🏷️</span>
                                              <div>
                                                <p className="font-semibold" style={{ color: 'var(--color-card-violet)' }}>
                                                  {proj?.type === 'trading' ? 'Initial deposit' : 'Initial purchase'}
                                                </p>
                                                <p style={{ color: 'var(--color-text-muted)' }}>Replaces the ${Number(proj?.purchasePrice ?? 0).toFixed(0)} estimate — no double-counting</p>
                                              </div>
                                            </button>
                                          </div>
                                        ) : (
                                          <>
                                            {/* No category option */}
                                            <button
                                              onClick={() => {
                                                const proj = projects.find((p) => p.id === pickerProjectDrill);
                                                if (Number(tx.amount) < 0 && proj && !proj.purchaseTxId) {
                                                  setPickerShowPurchasePrompt(true);
                                                } else {
                                                  linkToProject(tx.id, pickerProjectDrill!, null);
                                                }
                                              }}
                                              disabled={linkingProj}
                                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-(--color-elevated) disabled:opacity-50"
                                              style={tx.projectId === pickerProjectDrill && !tx.projectCategoryId ? { background: `${proj?.color || '#9B6DFF'}12` } : {}}>
                                              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                                style={{ background: 'var(--color-elevated)' }}>🏷️</span>
                                              <span className="flex-1 text-left" style={{ color: 'var(--color-text-secondary)' }}>
                                                {linkingProj ? 'Linking…' : 'No specific category'}
                                              </span>
                                              {tx.projectId === pickerProjectDrill && !tx.projectCategoryId && (
                                                <span className="text-xs" style={{ color: proj?.color || '#9B6DFF' }}>✓</span>
                                              )}
                                            </button>
                                            {/* Project categories */}
                                            {(proj?.categories ?? []).map((cat) => (
                                              <button key={cat.id}
                                                onClick={() => linkToProject(tx.id, pickerProjectDrill!, cat.id)}
                                                disabled={linkingProj}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-(--color-elevated) disabled:opacity-50"
                                                style={tx.projectId === pickerProjectDrill && tx.projectCategoryId === cat.id ? { background: `${cat.color}15` } : {}}>
                                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                                  style={{ background: `${cat.color}20` }}>{cat.icon}</span>
                                                <span className="flex-1 font-medium text-left"
                                                  style={{ color: tx.projectId === pickerProjectDrill && tx.projectCategoryId === cat.id ? cat.color : 'var(--color-text-primary)' }}>
                                                  {cat.name}
                                                </span>
                                                {tx.projectId === pickerProjectDrill && tx.projectCategoryId === cat.id && (
                                                  <span className="text-xs" style={{ color: cat.color }}>✓</span>
                                                )}
                                              </button>
                                            ))}
                                            {(!proj?.categories || proj.categories.length === 0) && (
                                              <p className="text-xs px-3 py-2 text-center" style={{ color: 'var(--color-text-muted)' }}>
                                                No categories — add them in Projects page.
                                              </p>
                                            )}
                                          </>
                                        )}

                                        {/* Mark as SOLD — only for income txs on active projects */}
                                        {Number(tx.amount) > 0 && proj?.status !== 'sold' && (
                                          <>
                                            <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                                            {markAsSaleConfirm === proj?.id ? (
                                              <div className="px-3 py-2.5 flex flex-col gap-2">
                                                <p className="text-xs font-semibold text-white">Mark {proj.name} as sold?</p>
                                                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                                  Sale price: +${Math.abs(Number(tx.amount)).toFixed(2)} · {tx.date}
                                                </p>
                                                <div className="flex gap-1.5">
                                                  <button type="button" onClick={() => setMarkAsSaleConfirm(null)}
                                                    className="flex-1 py-1.5 text-xs rounded-lg hover:bg-[var(--color-elevated)]"
                                                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                                                    Cancel
                                                  </button>
                                                  <button type="button"
                                                    onClick={() => markProjectAsSold(tx.id, proj.id)}
                                                    disabled={markAsSaleSaving}
                                                    className="flex-1 py-1.5 text-xs font-semibold rounded-lg hover:brightness-110 disabled:opacity-50"
                                                    style={{ background: 'color-mix(in srgb, var(--color-green) 20%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 35%, transparent)' }}>
                                                    {markAsSaleSaving ? '…' : '✓ Confirm'}
                                                  </button>
                                                </div>
                                              </div>
                                            ) : (
                                              <button type="button"
                                                onClick={() => setMarkAsSaleConfirm(proj.id)}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-[var(--color-elevated)] transition-colors"
                                                style={{ color: 'var(--color-green)' }}>
                                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                                  style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)' }}>🏷️</span>
                                                Mark {proj.name} as SOLD
                                              </button>
                                            )}
                                          </>
                                        )}
                                      </>
                                    );
                                  })()
                                ) : null}
                              </div>,
                              document.body
                            )}
                          </div>

                          {/* Row actions — a delimited cluster of the things you reach
                              for most, with the ⋮ keeping the long tail. Hidden until
                              the row is hovered or something inside it takes focus, so
                              a dense ledger stays quiet; `row-actions` makes it
                              permanently visible on touch, where nothing hovers.
                              It always occupies its space, so rows never reflow. */}
                          <div className={`relative shrink-0 items-center gap-0.5 p-0.5 rounded-lg row-actions opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${
                              canSplit || canUnsplit || canEdit || canDelete || hasRowMenu ? 'flex' : 'hidden'
                            }`}
                            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>

                            {canSplit && (
                              <button onClick={() => { setSplitTx(tx); setRowMenuTxId(null); }}
                                className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--color-surface)]"
                                style={{ color: 'var(--color-text-muted)' }}
                                title="Split into multiple categories" aria-label="Split into multiple categories">
                                <ScissorsIcon />
                              </button>
                            )}

                            {canUnsplit && (
                              <button onClick={() => { unsplitTransaction(tx); setRowMenuTxId(null); }}
                                className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--color-surface)]"
                                style={{ color: 'var(--color-text-muted)' }}
                                title="Unsplit — recombine into one transaction" aria-label="Unsplit — recombine into one transaction">
                                <UnsplitIcon />
                              </button>
                            )}

                            {canEdit && (
                              <button onClick={() => { openEditModal(tx); setRowMenuTxId(null); }}
                                className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--color-surface)]"
                                style={{ color: 'var(--color-text-muted)' }}
                                title="Edit transaction" aria-label="Edit transaction">
                                <PencilIcon />
                              </button>
                            )}

                            {canDelete && (
                              <button
                                onClick={(e) => {
                                  if (deleteConfirmId === tx.id) { setRowMenuTxId(null); setDeleteConfirmId(null); return; }
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setRowMenuPos({ top: rect.bottom + 6, left: Math.max(4, rect.right - 210) });
                                  setRowMenuTxId(tx.id);
                                  setDeleteConfirmId(tx.id);
                                }}
                                className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[color-mix(in_srgb,var(--color-rose)_18%,transparent)]"
                                style={{ color: 'var(--color-rose)' }}
                                title="Delete transaction" aria-label="Delete transaction">
                                <TrashIcon />
                              </button>
                            )}

                            {hasRowMenu && (
                              <button
                                onClick={(e) => {
                                  if (rowMenuTxId === tx.id) { setRowMenuTxId(null); setDeleteConfirmId(null); return; }
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setRowMenuPos({ top: rect.bottom + 6, left: Math.max(4, rect.right - 210) });
                                  setRowMenuTxId(tx.id);
                                  setDeleteConfirmId(null);
                                }}
                                className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--color-surface)]"
                                style={{ color: 'var(--color-text-muted)' }}
                                title="More actions" aria-label="More actions">
                                <KebabIcon />
                              </button>
                            )}

                            {rowMenuTxId === tx.id && rowMenuPos && createPortal(
                              <div ref={rowMenuRef} className="py-1 rounded-xl overflow-hidden"
                                style={{ ...glass, position: 'fixed', top: rowMenuPos.top, left: rowMenuPos.left, width: '210px', zIndex: 9999 }}>
                                {deleteConfirmId === tx.id ? (
                                  <div className="px-3 py-2.5">
                                    <p className="text-xs font-semibold mb-1.5">
                                      {tx.source === 'recurring' ? 'Delete this occurrence?' : 'Delete this transaction?'}
                                    </p>
                                    {tx.source === 'recurring' && (
                                      <p className="text-[10px] mb-2" style={{ color: 'var(--color-text-muted)' }}>
                                        Removes this month only — the schedule keeps running. Stop the
                                        whole series from Settings → Recurring.
                                      </p>
                                    )}
                                    {tx.transferAccountId && (
                                      <p className="text-[10px] mb-2" style={{ color: 'var(--color-rose)' }}>⚠ linked transfer will be unlinked</p>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => deleteManualTx(tx.id)}
                                        className="flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg"
                                        style={{ background: 'color-mix(in srgb, var(--color-rose) 20%, transparent)', color: 'var(--color-rose)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)' }}>
                                        Delete
                                      </button>
                                      <button onClick={() => setDeleteConfirmId(null)}
                                        className="flex-1 text-xs px-2 py-1.5 rounded-lg hover:bg-[var(--color-elevated)]"
                                        style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {/* Split, unsplit, edit and delete live in the row's
                                        icon cluster; what stays here is the long tail. */}
                                    {tx.categorizedByRuleId && (
                                      <>
                                        <button onClick={() => uncategorizeOne(tx)}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-[var(--color-elevated)]"
                                          style={{ color: 'var(--color-text-secondary)' }}>
                                          📌 Uncategorize this one
                                        </button>
                                        <button onClick={() => deleteRuleFromRow(tx)} disabled={deletingRuleId === tx.categorizedByRuleId}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-red-500/20 disabled:opacity-40"
                                          style={{ color: 'var(--color-rose)' }}>
                                          {deletingRuleId === tx.categorizedByRuleId ? 'Deleting rule…' : 'Delete the rule'}
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>,
                              document.body
                            )}
                          </div>

                          {/* Amount */}
                          <p className="text-sm font-bold tabular-nums w-24 text-right shrink-0"
                            style={{ color: txIsTransfer ? '#6B6B8A' : isIncome ? 'var(--color-green)' : 'white' }}>
                            {formatAmount(amount)}
                          </p>
                        </div>

                        {/* ── Transfer pair connector ── */}
                        {tx.counterpartTxId && (() => {
                          const cp = transactions.find((t) => t.id === tx.counterpartTxId);
                          if (!cp) return null;
                          const cpAcc    = cp.bankAccount;
                          const cpAmount = Number(cp.amount);
                          const cpColor  = cpAcc?.color || '#6B6B8A';
                          const fromAcc  = Number(tx.amount) < 0 ? tx.bankAccount : cpAcc;
                          const toAcc    = Number(tx.amount) < 0 ? cpAcc : tx.bankAccount;
                          return (
                            <div className="mx-4 mb-3 flex items-stretch gap-0 rounded-xl overflow-hidden"
                              style={{ background: 'rgba(107,107,138,0.07)', border: '1px solid rgba(107,107,138,0.18)' }}>
                              {/* Left accent */}
                              <div className="w-0.5 shrink-0" style={{ background: 'linear-gradient(to bottom, #6B6B8A55, #6B6B8A22)' }} />
                              <div className="flex items-center gap-3 px-3 py-2.5 flex-1 min-w-0">
                                {/* Link icon */}
                                <div className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center"
                                  style={{ background: 'rgba(107,107,138,0.20)' }}>
                                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: '#9B9BB8' }}>
                                    <path d="M6 8a2 2 0 1 0 4 0M2 4l3 3M14 4l-3 3M2 12l3-3M14 12l-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                  </svg>
                                </div>
                                {/* Transfer direction */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(155,155,184,0.5)' }}>Transfer</span>
                                    <span className="text-[10px]" style={{ color: 'rgba(155,155,184,0.4)' }}>
                                      {fromAcc?.accountName ?? '?'} → {toAcc?.accountName ?? '?'}
                                    </span>
                                  </div>
                                  <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{cp.name}</p>
                                </div>
                                {/* Counterpart amount */}
                                <span className="text-xs font-bold tabular-nums shrink-0"
                                  style={{ color: cpAmount >= 0 ? 'color-mix(in srgb, var(--color-green) 53%, transparent)' : 'var(--color-text-muted)' }}>
                                  {formatAmount(cpAmount)}
                                </span>
                              </div>
                            </div>
                          );
                        })()}

                      </div>
                    );
                        })}
                      </div>
                      )}
                    </div>
                    );
                  })}
                  </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Split transaction modal (manual — no receipt involved) */}
        {splitTx && (
          <SplitTransactionModal
            tx={splitTx}
            categories={categories}
            projects={projects}
            onSave={() => {
              loadTransactions();
              setSplitTx(null);
            }}
            onClose={() => setSplitTx(null)}
          />
        )}

        {/* Manual transaction modal */}
        {showManualTx && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowManualTx(false); setManualAccOpen(false); setManualCatOpen(false); setEditingTxId(null); } }}>
            {(() => {
              const isExpense  = manualTx.sign === '-';
              const accent     = isExpense ? 'var(--color-orange)' : 'var(--color-green)';
              const selAcc     = accounts.find((a) => a.id === manualTx.bankAccountId);
              const selCat     = categories.find((c) => c.id === manualTx.categoryId);
              const selDebt    = debts.find((d) => d.id === manualTx.debtId);
              const mq = manualCatSearch.trim().toLowerCase();
              const matches = (n: string) => !mq || n.toLowerCase().includes(mq);
              const catOptions = isExpense
                ? categories.filter((c) => (c.type === 'expense' || c.type === 'both') && matches(c.name))
                : null;
              // Project categories, flattened so one search covers every project.
              const selProjCat = manualTx.projectCategoryId
                ? projects.flatMap((p) => (p.categories ?? []).map((pc) => ({ project: p, cat: pc })))
                    .find((x) => x.cat.id === manualTx.projectCategoryId)
                : null;
              const manualProjOptions = projects.flatMap((p) =>
                (p.categories ?? [])
                  .filter((pc) => matches(pc.name) || matches(p.name))
                  .map((pc) => ({ project: p, cat: pc })));
              const incomePrimary = !isExpense
                ? categories.filter((c) => c.type === 'income' || c.type === 'both')
                : null;
              const incomeSecondary = !isExpense
                ? categories.filter((c) => c.type === 'expense')
                : null;
              const amt        = parseFloat(manualTx.amountStr) || 0;
              return (
                <form onSubmit={saveManualTx}
                  className="w-full max-w-lg flex flex-col rounded-2xl"
                  style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', maxHeight: '92dvh', overflow: 'hidden' }}>

                  {/* Hero header */}
                  <div className="flex flex-col items-center gap-3 px-6 pt-5 pb-5 rounded-t-2xl shrink-0"
                    style={{ background: `linear-gradient(160deg, ${accent}14 0%, transparent 60%)`, borderBottom: '1px solid var(--color-border)' }}>
                    <div className="flex items-start gap-3 w-full">
                      <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <path d="M16 12h3" /><path d="M3 9h18" />
                        </svg>
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-bold leading-tight">{editingTxId ? 'Edit transaction' : 'Add transaction'}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {isExpense
                            ? 'Record a cash payment or a transaction missing from your accounts.'
                            : 'Record money you received that is missing from your accounts.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between w-full">
                      {/* Type toggle */}
                      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                        <button type="button" onClick={() => setManualTx((f) => ({ ...f, sign: '-', categoryId: '', debtId: '' }))}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                          style={{ background: isExpense ? 'color-mix(in srgb, var(--color-orange) 13%, transparent)' : 'transparent', color: isExpense ? 'var(--color-orange)' : 'var(--color-text-muted)', border: isExpense ? '1px solid color-mix(in srgb, var(--color-orange) 27%, transparent)' : '1px solid transparent' }}>
                          − Expense
                        </button>
                        <button type="button" onClick={() => setManualTx((f) => ({ ...f, sign: '+', categoryId: '', debtId: '' }))}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                          style={{ background: !isExpense ? 'color-mix(in srgb, var(--color-green) 13%, transparent)' : 'transparent', color: !isExpense ? 'var(--color-green)' : 'var(--color-text-muted)', border: !isExpense ? '1px solid color-mix(in srgb, var(--color-green) 27%, transparent)' : '1px solid transparent' }}>
                          + Income
                        </button>
                      </div>
                      <button type="button" onClick={() => setShowManualTx(false)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)]"
                        style={{ color: 'var(--color-text-muted)' }}>
                        <CloseIcon />
                      </button>
                    </div>
                    {/* Big amount */}
                    <div className="flex items-center gap-1">
                      <span className="text-2xl font-black" style={{ color: accent }}>{isExpense ? '−' : '+'}</span>
                      <span className="text-3xl font-black" style={{ color: accent }}>$</span>
                      <input required type="number" min="0.01" step="0.01" placeholder="0.00" autoFocus
                        value={manualTx.amountStr}
                        onChange={(e) => setManualTx((f) => ({ ...f, amountStr: e.target.value }))}
                        className="text-3xl font-black outline-none bg-transparent w-40 text-center"
                        style={{ color: amt > 0 ? accent : 'var(--color-text-muted)', caretColor: accent }} />
                    </div>
                    {/* Description inline */}
                    <input placeholder="What was this for?" value={manualTx.name}
                      onChange={(e) => setManualTx((f) => ({ ...f, name: e.target.value }))}
                      className="text-sm text-center outline-none bg-transparent w-full"
                      style={{ color: manualTx.name ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }} />
                  </div>

                  <div className="flex flex-col gap-3 px-5 py-4 overflow-y-auto flex-1">

                    {/* Date + Account */}
                    <div className="flex gap-3">
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Transaction date</span>
                        <DatePicker value={manualTx.date} ariaLabel="Transaction date"
                          onChange={(date) => {
                            setManualTx((f) => ({ ...f, date }));
                            // The series starts on the transaction being recorded. Without
                            // this the start stayed at today, so picking Aug 1 silently
                            // produced a series starting today and no August entry at all.
                            if (date) {
                              setRecurring((r) => (r.startDateTouched
                                ? r
                                : { ...r, startDate: date, dayOfMonth: Number(date.slice(8, 10)) || r.dayOfMonth }));
                            }
                          }} />
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0" style={{ position: 'relative' }}>
                        {/* Money leaves an account on an expense and arrives on income —
                            one fixed label would be wrong half the time. */}
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                          {isExpense ? 'Paid from' : 'Deposited to'}
                        </span>
                        <button type="button" onClick={() => { setManualAccOpen((o) => !o); setManualCatOpen(false); }}
                          className="px-3 py-2.5 text-sm flex items-center gap-2 rounded-xl outline-none text-left w-full"
                          style={{ background: 'var(--color-elevated)', border: `1px solid ${selAcc ? (selAcc.color || accent) + '55' : 'var(--color-elevated)'}`, color: selAcc ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                          {selAcc ? (
                            <>
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: selAcc.color || accent }} />
                              <span className="flex-1 truncate text-xs">{selAcc.accountName}</span>
                            </>
                          ) : <span className="flex-1 text-xs">Select…</span>}
                          <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0 }}>
                            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        {manualAccOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden overflow-y-auto"
                            style={{ background: 'var(--popover-bg)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', zIndex: 60, maxHeight: 200 }}>
                            {accounts.map((a) => (
                              <button key={a.id} type="button"
                                onClick={() => { setManualTx((f) => ({ ...f, bankAccountId: a.id })); setManualAccOpen(false); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left"
                                style={{ background: manualTx.bankAccountId === a.id ? `${a.color || accent}18` : 'transparent', color: 'var(--color-text-primary)' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = `${a.color || accent}12`)}
                                onMouseLeave={(e) => (e.currentTarget.style.background = manualTx.bankAccountId === a.id ? `${a.color || accent}18` : 'transparent')}>
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color || '#9B6DFF' }} />
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">{a.accountName}</p>
                                  <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{a.bankName}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Category */}
                    <div className="flex flex-col gap-1.5" style={{ position: 'relative' }}>
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                        Category <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                      </span>
                      <button type="button" onClick={() => { setManualCatOpen((o) => !o); setManualAccOpen(false); setManualCatSearch(''); }}
                        className="px-3 py-2.5 text-sm flex items-center gap-2.5 rounded-xl outline-none text-left w-full"
                        style={{ background: 'var(--color-elevated)', border: `1px solid ${selCat ? selCat.color + '44' : 'var(--color-elevated)'}`, color: selCat ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                        {selDebt ? (
                          <>
                            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: 'color-mix(in srgb, var(--color-card-violet) 20%, transparent)' }}>🤝</span>
                            <span className="flex-1 font-medium" style={{ color: 'var(--color-card-violet)' }}>
                              {selDebt.direction === 'owed' ? 'Debt payment · ' : 'Debt repayment · '}{selDebt.borrowerName}
                            </span>
                          </>
                        ) : selProjCat ? (
                          <>
                            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${selProjCat.cat.color}20` }}>{selProjCat.cat.icon}</span>
                            <span className="flex-1 min-w-0">
                              <span className="block font-medium truncate" style={{ color: selProjCat.cat.color }}>{selProjCat.cat.name}</span>
                              <span className="block text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{selProjCat.project.icon} {selProjCat.project.name}</span>
                            </span>
                          </>
                        ) : selCat ? (
                          <>
                            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${selCat.color}20` }}>{selCat.icon}</span>
                            <span className="flex-1 font-medium" style={{ color: selCat.color }}>{selCat.name}</span>
                          </>
                        ) : <span className="flex-1">Uncategorized</span>}
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0 }}>
                          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      {manualCatOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl flex flex-col"
                          style={{ background: 'var(--popover-bg)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', zIndex: 60, maxHeight: 340, overflow: 'hidden' }}>
                          <div className="p-2 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <input autoFocus value={manualCatSearch}
                              onChange={(e) => setManualCatSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="Search categories or projects…"
                              aria-label="Search categories"
                              className="w-full px-2.5 py-2 text-xs outline-none rounded-lg"
                              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                          </div>
                          <div className="overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
                          <button type="button" onClick={() => { setManualTx((f) => ({ ...f, categoryId: '', projectId: '', projectCategoryId: '' })); setManualCatOpen(false); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors"
                            style={{ color: 'var(--color-text-muted)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-elevated)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: 'var(--color-elevated)' }}>—</span>
                            Uncategorized
                          </button>
                          {openDebts.length > 0 && (
                            <>
                              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Debt repayment</p>
                              {openDebts.map((d) => (
                                <button key={d.id} type="button"
                                  onClick={() => {
                                    setManualTx((f) => ({ ...f, debtId: d.id, categoryId: '', sign: d.direction === 'owed' ? '-' : '+' }));
                                    setManualCatOpen(false);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                  style={{ background: manualTx.debtId === d.id ? 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)' : 'transparent', color: manualTx.debtId === d.id ? 'var(--color-card-violet)' : 'var(--color-text-primary)' }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--color-card-violet) 12%, transparent)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = manualTx.debtId === d.id ? 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)' : 'transparent')}>
                                  <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: 'color-mix(in srgb, var(--color-card-violet) 20%, transparent)' }}>🤝</span>
                                  <span className="font-medium flex-1 text-left">
                                    {d.direction === 'owed' ? '↓ ' : '↑ '}{d.borrowerName}
                                  </span>
                                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>${Number(d.remaining).toLocaleString('en-US', { minimumFractionDigits: 2 })} left</span>
                                </button>
                              ))}
                              <div className="h-px my-1" style={{ background: 'var(--color-border)' }} />
                            </>
                          )}
                          {isExpense ? (
                            catOptions!.map((c) => (
                              <button key={c.id} type="button"
                                onClick={() => { setManualTx((f) => ({ ...f, categoryId: c.id })); setManualCatOpen(false); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                style={{ background: manualTx.categoryId === c.id ? `${c.color}18` : 'transparent', color: manualTx.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = `${c.color}12`)}
                                onMouseLeave={(e) => (e.currentTarget.style.background = manualTx.categoryId === c.id ? `${c.color}18` : 'transparent')}>
                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                                <span className="font-medium">{c.name}</span>
                              </button>
                            ))
                          ) : (
                            <>
                              {incomePrimary!.map((c) => (
                                <button key={c.id} type="button"
                                  onClick={() => { setManualTx((f) => ({ ...f, categoryId: c.id })); setManualCatOpen(false); }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                  style={{ background: manualTx.categoryId === c.id ? `${c.color}18` : 'transparent', color: manualTx.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = `${c.color}12`)}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = manualTx.categoryId === c.id ? `${c.color}18` : 'transparent')}>
                                  <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                                  <span className="font-medium">{c.name}</span>
                                </button>
                              ))}
                              {incomeSecondary!.length > 0 && (
                                <>
                                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Expense categories</p>
                                  {incomeSecondary!.map((c) => (
                                    <button key={c.id} type="button"
                                      onClick={() => { setManualTx((f) => ({ ...f, categoryId: c.id })); setManualCatOpen(false); }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                      style={{ background: manualTx.categoryId === c.id ? `${c.color}18` : 'transparent', color: manualTx.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}
                                      onMouseEnter={(e) => (e.currentTarget.style.background = `${c.color}12`)}
                                      onMouseLeave={(e) => (e.currentTarget.style.background = manualTx.categoryId === c.id ? `${c.color}18` : 'transparent')}>
                                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                                      <span className="font-medium">{c.name}</span>
                                    </button>
                                  ))}
                                </>
                              )}
                            </>
                          )}

                          {manualProjOptions.length > 0 && (
                            <>
                              <div className="h-px my-1" style={{ background: 'var(--color-border)' }} />
                              <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Projects</p>
                              {manualProjOptions.map(({ project, cat: pc }) => {
                                const on = manualTx.projectCategoryId === pc.id && manualTx.projectId === project.id;
                                return (
                                  <button key={`${project.id}:${pc.id}`} type="button"
                                    onClick={() => {
                                      // Project- and budget-categorised are mutually exclusive.
                                      setManualTx((f) => ({ ...f, projectId: project.id, projectCategoryId: pc.id, categoryId: '', debtId: '' }));
                                      setManualCatOpen(false);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                    style={{ background: on ? `${pc.color}18` : 'transparent' }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = `${pc.color}12`)}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = on ? `${pc.color}18` : 'transparent')}>
                                    <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${pc.color}20` }}>{pc.icon}</span>
                                    <span className="flex-1 min-w-0 text-left">
                                      <span className="block font-medium truncate" style={{ color: on ? pc.color : 'var(--color-text-primary)' }}>{pc.name}</span>
                                      <span className="block text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{project.icon} {project.name}</span>
                                    </span>
                                  </button>
                                );
                              })}
                            </>
                          )}

                          {catOptions?.length === 0 && manualProjOptions.length === 0 && manualCatSearch.trim() && (
                            <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                              Nothing matches “{manualCatSearch}”.
                            </p>
                          )}
                          </div>
                        </div>
                      )}
                    </div>

                  {/* Note */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                      Note <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                    </span>
                    <input
                      type="text"
                      placeholder="Add a note…"
                      maxLength={500}
                      value={manualTx.note}
                      onChange={(e) => setManualTx((f) => ({ ...f, note: e.target.value }))}
                      className="px-3 py-2.5 text-sm outline-none rounded-xl w-full"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>

                  {/* Recurring — editing an existing row is not a series */}
                  {!editingTxId && (
                    <RecurringPanel
                      value={recurring}
                      onChange={setRecurring}
                      amount={parseFloat(manualTx.amountStr) || 0}
                      accent={accent} isExpense={isExpense} />
                  )}

                  </div>

                  {/* Footer */}
                  <div className="flex gap-2 items-center px-5 py-4 rounded-b-2xl"
                    style={{ borderTop: '1px solid var(--color-border)' }}>
                    {manualTxError && <p className="flex-1 text-xs" style={{ color: 'var(--color-rose)' }}>{manualTxError}</p>}
                    {!manualTxError && <span className="flex-1" />}
                    <button type="button" onClick={() => { setShowManualTx(false); setManualTxError(''); }}
                      className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
                      style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
                    <div className="flex flex-col items-end gap-1">
                      <button type="submit" disabled={manualTxSaving}
                        className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-60 transition-all"
                        style={{ background: accent }}>
                        {manualTxSaving ? 'Saving…' : editingTxId ? 'Save Changes' : recurring.enabled ? 'Save & schedule' : 'Add Transaction'}
                      </button>
                      {!editingTxId && recurring.enabled && (() => {
                        const all = occurrenceDates(recurring);
                        const todayIso = new Date().toISOString().slice(0, 10);
                        const recorded = all.filter((d) => d <= todayIso || recurring.recordFirst).length
                          ? Math.max(all.filter((d) => d <= todayIso).length, recurring.recordFirst ? 1 : 0)
                          : 0;
                        const scheduled = Math.max(all.length - recorded, 0);
                        return (
                          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                            {recorded} recorded transaction{recorded === 1 ? '' : 's'} · {recurring.endMode === 'never' ? 'rest' : scheduled} scheduled
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                </form>
              );
            })()}
          </div>,
          document.body
        )}

        {/* ── Link Transfer modal ── */}
        {transferModal && (
          <LinkTransferModal
            tx={transferModal.tx}
            matches={transferModalMatches}
            matchesLoading={transferModalLoading}
            accounts={accounts}
            onClose={() => { setTransferModal(null); setTransferModalMatches([]); }}
            onLink={async (accountId, matchTxId, note) => {
              const srcTx = transferModal.tx;
              await assignCategory(srcTx.id, transferModal.categoryId, true);
              await setTransferAccount(srcTx.id, accountId, matchTxId ?? undefined);
              // The link is what was asked for, so a failed note must not undo it.
              if (note) await saveTransferNote([srcTx.id, matchTxId], note);
              setTransferModal(null);
              setTransferModalMatches([]);
            }}
          />
        )}

        {/* New category from picker */}
        {showNewCatModal && (
          <CategoryFormModal
            onClose={() => { setShowNewCatModal(false); setNewCatForTxId(null); }}
            onSaved={(cat) => {
              setCategories((prev) => [...prev, cat]);
              if (newCatForTxId) assignCategory(newCatForTxId, cat.id);
              setShowNewCatModal(false);
              setNewCatForTxId(null);
            }}
          />
        )}

        {/* ── Import toast notification ── */}
        {importToast && createPortal(
          <div
            className="fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3.5 rounded-2xl"
            style={{
              background: 'var(--color-surface)',
              border: 'var(--glass-border)',
              boxShadow: 'var(--glass-shadow)',
              backdropFilter: 'var(--glass-blur)',
              minWidth: '260px',
              maxWidth: '340px',
              animation: 'slideUp 0.25s ease-out',
            }}>
            {/* Account icon */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ background: `${importToast.account.color || '#9B6DFF'}22` }}>
              <AccountTypeIcon type={importToast.account.accountType} size={18} />
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Import complete
              </p>
              <p className="text-sm font-semibold mt-0.5 truncate">
                {importToast.account.bankName} · {importToast.account.accountName}
              </p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="flex items-center gap-1 text-xs font-semibold"
                  style={{ color: 'var(--color-green)' }}>
                  <span>✓</span>
                  <span>{importToast.imported} new</span>
                </span>
                {importToast.skipped > 0 && (
                  <span className="flex items-center gap-1 text-xs"
                    style={{ color: 'var(--color-text-muted)' }}>
                    <span>⟳</span>
                    <span>{importToast.skipped} skipped</span>
                  </span>
                )}
                {importToast.imported === 0 && importToast.skipped === 0 && (
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No transactions found</span>
                )}
              </div>
            </div>
            {/* Dismiss */}
            <button onClick={() => { setImportToast(null); if (importToastTimer.current) clearTimeout(importToastTimer.current); }}
              className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0 mt-0.5"
              style={{ color: 'var(--color-text-muted)' }}>
              <CloseIcon />
            </button>
          </div>,
          document.body
        )}

        {/* ── Categorization rule toast ── */}
        {ruleToast && createPortal(
          <div
            className="fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3.5 rounded-2xl"
            style={{
              background: 'var(--color-surface)',
              border: 'var(--glass-border)',
              boxShadow: 'var(--glass-shadow)',
              backdropFilter: 'var(--glass-blur)',
              minWidth: '260px',
              maxWidth: '360px',
              animation: 'slideUp 0.25s ease-out',
            }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{
                background: ruleToast.kind === 'error'
                  ? 'color-mix(in srgb, var(--color-card-orange) 20%, transparent)'
                  : ruleToast.kind === 'categorized'
                  ? 'color-mix(in srgb, var(--color-card-green) 20%, transparent)'
                  : 'color-mix(in srgb, var(--color-card-violet) 20%, transparent)',
              }}>
              {ruleToast.kind === 'error' ? '⚠️' : ruleToast.kind === 'categorized' ? (ruleToast.categoryIcon || '✓') : '📌'}
            </div>
            <div className="flex-1 min-w-0">
              {ruleToast.kind === 'categorized' ? (
                <>
                  <p className="text-sm font-semibold">Categorized as {ruleToast.categoryLabel}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {filter === 'uncategorized' ? "It's left the Uncategorized list. " : ''}
                    Pin it to auto-categorize transactions like this from now on.
                  </p>
                  <button
                    onClick={() => createRule(ruleToast.tx, ruleToast.categoryId)}
                    className="mt-2 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors hover:brightness-110"
                    style={{
                      background: 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)',
                      color: 'var(--color-card-violet)',
                    }}>
                    📌 Pin as rule
                  </button>
                </>
              ) : ruleToast.kind === 'created' ? (
                <>
                  <p className="text-sm font-semibold">Rule created</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {ruleToast.matchStrategy === 'prefix'
                      ? `Any transaction starting with "${ruleToast.matchLabel}" will auto-categorize from now on.`
                      : `"${ruleToast.matchLabel}" will auto-categorize from now on.`}
                  </p>
                </>
              ) : ruleToast.kind === 'duplicate' ? (
                <>
                  <p className="text-sm font-semibold">Rule already exists</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    A rule for "{ruleToast.matchLabel}" already exists.{' '}
                    <a href="/settings?tab=rules" className="underline" style={{ color: 'var(--color-sky)' }}>Edit it in Settings</a>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold">Something went wrong</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {ruleToast.reason || `Something went wrong creating a rule for "${ruleToast.matchLabel}".`}
                  </p>
                </>
              )}
            </div>
            <button onClick={() => { setRuleToast(null); if (ruleToastTimer.current) clearTimeout(ruleToastTimer.current); }}
              className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0 mt-0.5"
              style={{ color: 'var(--color-text-muted)' }}>
              <CloseIcon />
            </button>
          </div>,
          document.body
        )}

        {/* CSV Import modal */}
        {importAccount && (
          <CsvImportModal
            account={importAccount}
            onClose={() => setImportAccount(null)}
            onImported={(result) => {
              setImportAccount(null);
              jumpToImportedRange(result);
              loadTransactions();
              setImportToast(result);
              if (importToastTimer.current) clearTimeout(importToastTimer.current);
              importToastTimer.current = setTimeout(() => setImportToast(null), 6000);
            }}
          />
        )}

        {/* File-first import modal — auto-detects account from CSV */}
        {showFileImport && (
          <ImportReconcileModal
            accounts={accounts}
            onClose={() => setShowFileImport(false)}
            onAccountCreated={(a) => setAccounts((prev) => prev.some((x) => x.id === a.id) ? prev : [...prev, a as BankAccount])}
            onImported={(result) => {
              setShowFileImport(false);
              jumpToImportedRange(result);
              loadTransactions();
              setImportToast(result);
              if (importToastTimer.current) clearTimeout(importToastTimer.current);
              importToastTimer.current = setTimeout(() => setImportToast(null), 6000);
            }}
          />
        )}
      </main>

      {/* ── Drag handle ── */}
      <div
        onMouseDown={startBudgetResize}
        className="w-1.5 shrink-0 cursor-col-resize group relative hover:bg-violet-500/30 transition-colors duration-150"
        style={{ background: 'var(--color-elevated)' }}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 opacity-0 group-hover:opacity-100 rounded-full transition-opacity duration-150"
          style={{ background: 'color-mix(in srgb, var(--color-primary) 70%, transparent)' }} />
      </div>

      {/* ── Insights column ── */}
      <div className="hidden md:flex shrink-0 flex-col overflow-hidden border-l"
        style={{ width: budgetWidth, minWidth: 180, maxWidth: 480, borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <InsightsPanel
          selectedTx={selectedTx}
          onClose={() => setSelectedTx(null)}
          transactions={transactions}
          recurringMap={recurringMap}
          prevTransactions={prevTransactions}
          subscriptions={subscriptions}
          onSubscriptionChange={handleSubscriptionChange}
          onNoteUpdate={handleNoteUpdate}
          currentMonth={insightsMonth}
        />
      </div>

      {/* ── Mobile bottom sheet (md and below only) ── */}
      {selectedTx && createPortal(
        <div
          className="md:hidden fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedTx(null); }}>
          <div className="w-full rounded-t-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '80dvh', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <InsightsPanel
              selectedTx={selectedTx}
              onClose={() => setSelectedTx(null)}
              transactions={transactions}
              recurringMap={recurringMap}
              prevTransactions={prevTransactions}
              subscriptions={subscriptions}
              onSubscriptionChange={handleSubscriptionChange}
              onNoteUpdate={handleNoteUpdate}
              currentMonth={insightsMonth}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * A project's photo, falling back to its emoji on a wash of its own color.
 *
 * A car or a house is far quicker to recognise by its picture than by a generic
 * 🚗, which is the whole point of showing it in the picker. `alt` is empty on
 * purpose: the project's name always sits directly beside this, so labelling
 * the image would just make a screen reader announce it twice.
 */
function ProjectAvatar({ project, size }: { project: Project; size: number }) {
  const color = project.color || '#9B6DFF';
  return (
    <span className="rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
      style={{ width: size, height: size, background: `${color}20`, fontSize: size * 0.58 }}>
      {project.imageUrl
        ? <img src={project.imageUrl} alt="" className="w-full h-full object-cover" />
        : project.icon}
    </span>
  );
}

/* ── icons ── */
function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function TagIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
}
function ChevronIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
}
function UploadIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
}
function SyncIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>;
}
function PlusIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function CloseIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function TrashIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
}
function ScissorsIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>;
}
function UnsplitIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>;
}
function PencilIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>;
}
function KebabIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>;
}
function BellIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function SlidersIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>;
}
