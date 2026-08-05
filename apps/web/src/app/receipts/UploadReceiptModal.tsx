'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Props {
  onCreated: () => void;
  onClose: () => void;
}

export default function UploadReceiptModal({ onCreated, onClose }: Props) {
  const [merchant, setMerchant] = useState('');
  const [total, setTotal] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    setError(null);
    if (!merchant.trim()) { setError('Merchant is required.'); return; }
    const totalNum = Number(total);
    if (!Number.isFinite(totalNum) || totalNum <= 0) { setError('Enter a valid total.'); return; }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.set('merchant', merchant.trim());
      form.set('total', total);
      if (orderDate) form.set('orderDate', orderDate);
      if (orderNumber) form.set('orderNumber', orderNumber);
      if (file) form.set('image', file);

      const res = await fetch(`${API}/receipts/manual`, { method: 'POST', credentials: 'include', body: form });
      if (!res.ok) { setError('Could not save the receipt.'); return; }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)',
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md rounded-2xl p-6"
        style={{ background: 'var(--color-surface)', border: 'var(--glass-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg" style={{ color: 'var(--color-text-primary)' }}>Upload Receipt</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        <div className="space-y-3">
          <input placeholder="Merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
          <input placeholder="Total" type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
          <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
          <input placeholder="Order number (optional)" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />

          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            className="w-full px-3 py-2 text-sm rounded-xl text-left"
            style={inputStyle}>
            {file ? file.name : 'Attach photo or PDF (optional)'}
          </button>

          {error && <p className="text-xs" style={{ color: 'var(--color-card-orange)' }}>{error}</p>}

          <button onClick={submit} disabled={submitting}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'linear-gradient(180deg, var(--color-card-violet), var(--color-primary))', color: '#fff' }}>
            {submitting ? 'Saving…' : 'Save Receipt'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
