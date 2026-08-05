'use client';

import { useState, useEffect, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import StatStrip from './StatStrip';
import FilterBar from './FilterBar';
import ReceiptRow, { GRID_CLASSES } from './ReceiptRow';
import ReceiptDetailPanel from './ReceiptDetailPanel';
import UploadReceiptModal from './UploadReceiptModal';
import { filterReceipts, distinctMerchants, DEFAULT_FILTERS, type Receipt, type ReceiptFilters } from '@/lib/receipts/derive';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category { id: string; name: string; icon: string; color: string; type: string }

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [itemCategories, setItemCategories] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReceiptFilters>(DEFAULT_FILTERS);
  const [showUpload, setShowUpload] = useState(false);

  function refetchReceipts() {
    return fetch(`${API}/receipts`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setReceipts(d.receipts);
        setSyncError(d.syncError);
        setSelected((prev) => (prev ? d.receipts.find((r: Receipt) => r.id === prev.id) ?? null : null));
      });
  }

  useEffect(() => {
    fetch(`${API}/gmail/status`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setGmailConnected(d.connected))
      .catch(() => setGmailConnected(false));

    fetch(`${API}/categories`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});

    refetchReceipts()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const merchants = useMemo(() => distinctMerchants(receipts), [receipts]);
  const visible = useMemo(() => filterReceipts(receipts, filters), [receipts, filters]);
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  function openReceipt(r: Receipt) {
    setSelected(r);
    setItemCategories({});
  }
  function closeReceipt() { setSelected(null); }
  function setCategory(idx: number, categoryId: string) {
    setItemCategories((prev) => ({ ...prev, [idx]: categoryId }));
  }

  async function handleImport() {
    if (!selected) return;
    setImporting(true);

    const groups: Record<string, number[]> = {};
    selected.items.forEach((_, idx) => {
      const catId = itemCategories[idx] || '__uncategorized__';
      if (!groups[catId]) groups[catId] = [];
      groups[catId].push(idx);
    });
    const splits = Object.entries(groups).map(([catId, indices]) => ({
      itemIndices: indices,
      categoryId: catId === '__uncategorized__' ? null : catId,
      bankAccountId: null,
    }));

    try {
      const res = await fetch(`${API}/receipts/${selected.id}/import`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splits }),
      });
      if (res.ok) {
        setReceipts((prev) => prev.map((r) => r.id === selected.id ? { ...r, imported: true } : r));
        setSelected(null);
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto min-w-0 pt-14 md:pt-0">
        <div className="p-6 md:p-8">
          <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>Receipts</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Browse merchant receipts from your Gmail and create transactions.
              </p>
            </div>
            <button onClick={() => setShowUpload(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'color-mix(in srgb, var(--color-card-violet) 15%, transparent)', color: 'var(--color-card-violet)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 25%, transparent)' }}>
              Upload Receipt
            </button>
          </div>

          {showUpload && (
            <UploadReceiptModal
              onClose={() => setShowUpload(false)}
              onCreated={() => { setShowUpload(false); refetchReceipts(); }}
            />
          )}

          {gmailConnected === true && syncError && (
            <div className="rounded-2xl p-4 mb-6 flex items-start gap-3"
              style={{ background: 'color-mix(in srgb, var(--color-card-orange) 10%, var(--color-surface))', border: '1px solid color-mix(in srgb, var(--color-card-orange) 25%, transparent)' }}>
              <p className="text-sm" style={{ color: 'var(--color-card-orange)' }}>
                <span className="font-medium">Gmail sync failed:</span> {syncError}
                {receipts.length > 0 && ' Showing previously synced receipts.'}
              </p>
            </div>
          )}

          {gmailConnected === false && (
            <div className="rounded-2xl p-6 mb-6 text-center"
              style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)' }}>
              <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                Connect your Gmail to find receipts automatically.
              </p>
              <a href="/settings?tab=integrations"
                className="inline-block text-sm px-4 py-2 rounded-xl font-medium"
                style={{ background: 'color-mix(in srgb, var(--color-card-violet) 15%, transparent)', color: 'var(--color-card-violet)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 25%, transparent)', textDecoration: 'none' }}>
                Connect Gmail →
              </a>
            </div>
          )}

          <div className="mb-6">
            <StatStrip receipts={visible} loading={loading} />
          </div>

          <div className="mb-6">
            <FilterBar filters={filters} onChange={setFilters} merchants={merchants} />
          </div>

          {loading && (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading receipts…</p>
          )}

          {!loading && receipts.length === 0 && gmailConnected && !syncError && (
            <div className="rounded-2xl p-8 text-center"
              style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)' }}>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No receipt emails found in the last 90 days.</p>
            </div>
          )}

          {!loading && receipts.length > 0 && visible.length === 0 && (
            <div className="rounded-2xl p-8 text-center"
              style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)' }}>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No receipts match these filters.</p>
            </div>
          )}

          {visible.length > 0 && (
            <div className={`hidden md:grid items-center gap-2 px-4 py-2 mb-2 text-[10px] font-bold uppercase tracking-wider ${GRID_CLASSES}`}
              style={{ color: 'var(--color-text-muted)' }}>
              <span>Source</span>
              <span>Merchant</span>
              <span>Date</span>
              <span className="text-right">Amount</span>
              <span>Category</span>
              <span>Match Status</span>
            </div>
          )}

          <div className="grid gap-3">
            {visible.map((r) => (
              <ReceiptRow key={r.id} receipt={r} onClick={() => openReceipt(r)} />
            ))}
          </div>
        </div>
      </main>

      {/* Desktop detail rail — hidden below md, matching transactions/InsightsPanel.tsx */}
      <aside className="hidden md:flex shrink-0 flex-col overflow-hidden border-l"
        style={{ width: 400, borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        {selected ? (
          <ReceiptDetailPanel
            receipt={selected}
            categories={expenseCategories}
            itemCategories={itemCategories}
            onSetCategory={setCategory}
            onImport={handleImport}
            importing={importing}
            onClose={closeReceipt}
            onReceiptChanged={refetchReceipts}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Select a receipt to see its details.</p>
          </div>
        )}
      </aside>

      {/* Mobile detail overlay */}
      {selected && (
        <div className="md:hidden fixed inset-0 z-50" style={{ background: 'var(--color-base)' }}>
          <ReceiptDetailPanel
            receipt={selected}
            categories={expenseCategories}
            itemCategories={itemCategories}
            onSetCategory={setCategory}
            onImport={handleImport}
            importing={importing}
            onClose={closeReceipt}
            onReceiptChanged={refetchReceipts}
          />
        </div>
      )}
    </div>
  );
}
