'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface ReceiptItem { name: string; quantity: number; unitPrice: number; total: number }
interface Receipt {
  id: string; merchant: string; orderNumber: string | null; orderDate: string | null;
  total: number; currency: string; items: ReceiptItem[]; rawSubject: string; imported: boolean; parsedAt: string;
}
interface Category { id: string; name: string; icon: string; color: string; type: string }

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [itemCategories, setItemCategories] = useState<Record<number, string>>({});
  const [itemAccounts, setItemAccounts] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${API}/gmail/status`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setGmailConnected(d.connected))
      .catch(() => setGmailConnected(false));

    fetch(`${API}/categories`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});

    fetch(`${API}/receipts`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setReceipts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function openReceipt(r: Receipt) {
    setSelected(r);
    setItemCategories({});
    setItemAccounts({});
  }

  function closeReceipt() { setSelected(null); }

  function setCategory(idx: number, categoryId: string) {
    setItemCategories((prev) => ({ ...prev, [idx]: categoryId }));
  }

  function countGroups(): number {
    if (!selected) return 1;
    const totalItems = selected.items.length;
    const assigned = new Set<string>();
    let hasUncategorized = false;
    for (let idx = 0; idx < totalItems; idx++) {
      const catId = itemCategories[idx];
      if (catId && catId !== '') {
        assigned.add(catId);
      } else {
        hasUncategorized = true;
      }
    }
    return assigned.size + (hasUncategorized ? 1 : 0) || 1;
  }

  async function handleImport() {
    if (!selected) return;
    setImporting(true);

    // Group item indices by categoryId
    const groups: Record<string, number[]> = {};
    selected.items.forEach((_, idx) => {
      const catId = itemCategories[idx] || '__uncategorized__';
      if (!groups[catId]) groups[catId] = [];
      groups[catId].push(idx);
    });

    const splits = Object.entries(groups).map(([catId, indices]) => ({
      itemIndices: indices,
      categoryId: catId === '__uncategorized__' ? null : catId,
      bankAccountId: itemAccounts[indices[0]] ?? null,
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

  const cardStyle: React.CSSProperties = {
    background: 'rgba(35,35,47,0.5)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
  };

  const expenseCategories = categories.filter((c) => c.type === 'expense');

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 p-6 md:p-8" style={{ minWidth: 0 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: '#F2F1EA' }}>Receipts</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7488' }}>Browse merchant receipts from your Gmail and create transactions.</p>
        </div>

        {gmailConnected === false && (
          <div className="rounded-2xl p-6 mb-6 text-center" style={cardStyle}>
            <p className="text-sm mb-3" style={{ color: '#aeb4c2' }}>Connect your Gmail to find receipts automatically.</p>
            <a href="/settings?tab=integrations"
              className="inline-block text-sm px-4 py-2 rounded-xl font-medium"
              style={{ background: 'rgba(155,109,255,0.15)', color: '#9B6DFF', border: '1px solid rgba(155,109,255,0.25)', textDecoration: 'none' }}>
              Connect Gmail →
            </a>
          </div>
        )}

        {loading && (
          <p className="text-sm" style={{ color: '#6b7488' }}>Loading receipts…</p>
        )}

        {!loading && receipts.length === 0 && gmailConnected && (
          <div className="rounded-2xl p-8 text-center" style={cardStyle}>
            <p className="text-sm" style={{ color: '#aeb4c2' }}>No receipt emails found in the last 90 days.</p>
          </div>
        )}

        <div className="grid gap-3">
          {receipts.map((r) => (
            <button key={r.id} onClick={() => openReceipt(r)}
              className="w-full text-left rounded-2xl p-4 transition-opacity hover:opacity-80"
              style={cardStyle}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#F2F1EA' }}>{r.merchant}</p>
                  {r.orderNumber && <p className="text-xs mt-0.5" style={{ color: '#6b7488' }}>Order {r.orderNumber}</p>}
                  {r.orderDate && <p className="text-xs mt-0.5" style={{ color: '#6b7488' }}>{r.orderDate}</p>}
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm" style={{ color: '#F2F1EA' }}>
                    ${Number(r.total).toFixed(2)}
                  </p>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={r.imported
                      ? { background: 'rgba(79,191,127,0.12)', color: '#4FBF7F' }
                      : { background: 'rgba(245,200,66,0.12)', color: '#F5C842' }}>
                    {r.imported ? 'Imported' : 'Pending'}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Receipt detail drawer */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={closeReceipt}>
            <div className="w-full max-w-lg rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
              style={{ background: 'rgba(20,28,50,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-lg" style={{ color: '#F2F1EA' }}>{selected.merchant}</h2>
                  {selected.orderNumber && <p className="text-xs" style={{ color: '#6b7488' }}>Order {selected.orderNumber}</p>}
                </div>
                <button onClick={closeReceipt} style={{ color: '#6b7488' }}>✕</button>
              </div>

              <p className="text-xs mb-4" style={{ color: '#aeb4c2' }}>
                Assign a category to each item. Items with the same category become one transaction.
              </p>

              <div className="space-y-2 mb-6">
                {selected.items.map((item, idx) => (
                  <div key={idx} className="rounded-xl p-3 flex items-center gap-3"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#E8E6DF' }}>{item.name}</p>
                      <p className="text-xs" style={{ color: '#6b7488' }}>
                        {item.quantity > 1 ? `${item.quantity}× ` : ''}${item.unitPrice.toFixed(2)} = ${item.total.toFixed(2)}
                      </p>
                    </div>
                    <select
                      value={itemCategories[idx] ?? ''}
                      onChange={(e) => setCategory(idx, e.target.value)}
                      className="text-xs rounded-lg px-2 py-1.5 outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#E8E6DF', border: '1px solid rgba(255,255,255,0.1)', minWidth: 120 }}>
                      <option value="">No category</option>
                      {expenseCategories.map((c) => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.15)' }}>
                <p className="text-xs" style={{ color: '#9B6DFF' }}>
                  This will create <strong>{countGroups()}</strong> transaction{countGroups() !== 1 ? 's' : ''} totaling <strong>${Number(selected.total).toFixed(2)}</strong>.
                </p>
              </div>

              <button onClick={handleImport} disabled={importing}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: 'linear-gradient(180deg,#9B6DFF,#7B4DDF)', color: '#fff' }}>
                {importing ? 'Creating…' : `Create ${countGroups()} Transaction${countGroups() !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
