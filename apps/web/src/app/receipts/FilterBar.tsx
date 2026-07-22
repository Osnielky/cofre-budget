'use client';

import type { ReceiptFilters, ReceiptStatus } from '@/lib/receipts/derive';
import { DEFAULT_FILTERS } from '@/lib/receipts/derive';

interface Props {
  filters: ReceiptFilters;
  onChange: (next: ReceiptFilters) => void;
  merchants: string[];
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-elevated)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
};

export default function FilterBar({ filters, onChange, merchants }: Props) {
  function set<K extends keyof ReceiptFilters>(key: K, value: ReceiptFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  const isDefault =
    !filters.search && !filters.merchant && !filters.dateFrom && !filters.dateTo && filters.status === 'all';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        placeholder="Search receipts, merchants…"
        value={filters.search}
        onChange={(e) => set('search', e.target.value)}
        className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-xl outline-none"
        style={inputStyle}
      />
      <select value={filters.merchant} onChange={(e) => set('merchant', e.target.value)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle}>
        <option value="">All Merchants</option>
        {merchants.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input type="date" value={filters.dateFrom} onChange={(e) => set('dateFrom', e.target.value)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
      <span style={{ color: 'var(--color-text-muted)' }}>→</span>
      <input type="date" value={filters.dateTo} onChange={(e) => set('dateTo', e.target.value)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
      <select value={filters.status} onChange={(e) => set('status', e.target.value as ReceiptStatus)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle}>
        <option value="all">All Statuses</option>
        <option value="imported">Imported</option>
        <option value="pending">Pending Review</option>
      </select>
      {!isDefault && (
        <button
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="px-3 py-2 text-sm font-medium rounded-xl transition-colors"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
          Clear filters
        </button>
      )}
    </div>
  );
}
