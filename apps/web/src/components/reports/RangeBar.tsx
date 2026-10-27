'use client';

import { PRESETS, type RangePreset, type ReportRange } from '@/lib/reports/range';
import { Segmented } from './ui';

export default function RangeBar({ range, preset, custom, onPreset, onCustom }: {
  range: ReportRange; preset: RangePreset; custom: { from: string; to: string };
  onPreset: (p: RangePreset) => void; onCustom: (c: { from: string; to: string }) => void;
}) {
  const input = 'px-2.5 py-1.5 text-xs rounded-lg outline-none min-w-0';
  const inputStyle = { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <Segmented value={preset} options={PRESETS} onChange={onPreset} />
        {preset === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => onCustom({ ...custom, from: e.target.value })} aria-label="From" className={input} style={inputStyle} />
            <span style={{ color: 'var(--color-text-muted)' }}>→</span>
            <input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => onCustom({ ...custom, to: e.target.value })} aria-label="To" className={input} style={inputStyle} />
          </div>
        )}
      </div>
      <p className="text-xs sm:text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
        <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{range.label}</span>
        {' '}· compared with {range.prevLabel}
      </p>
    </div>
  );
}
