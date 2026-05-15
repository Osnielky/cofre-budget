'use client';

import { useState, useRef, useEffect } from 'react';

export const BANKS = [
  { name: 'Chase',           domain: 'chase.com',           color: '#117ACA', abbr: 'CH' },
  { name: 'Bank of America', domain: 'bankofamerica.com',   color: '#E31837', abbr: 'BA' },
  { name: 'Wells Fargo',     domain: 'wellsfargo.com',      color: '#CC0000', abbr: 'WF' },
  { name: 'Citibank',        domain: 'citi.com',            color: '#003B70', abbr: 'CI' },
  { name: 'U.S. Bank',       domain: 'usbank.com',          color: '#0C2074', abbr: 'US' },
  { name: 'Truist',          domain: 'truist.com',          color: '#6B2C91', abbr: 'TR' },
  { name: 'PNC Bank',        domain: 'pnc.com',             color: '#FF6600', abbr: 'PN' },
  { name: 'Capital One',     domain: 'capitalone.com',      color: '#D03027', abbr: 'C1' },
  { name: 'TD Bank',         domain: 'td.com',              color: '#34B233', abbr: 'TD' },
  { name: 'Goldman Sachs',   domain: 'goldmansachs.com',    color: '#6B8D73', abbr: 'GS' },
] as const;

type Bank = (typeof BANKS)[number];

const glass: React.CSSProperties = {
  background: 'rgba(25,25,40,0.97)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  inputStyle?: React.CSSProperties;
  compact?: boolean;
}

interface DropPos { top: number; left: number; width: number; maxHeight: number }

export default function BankSelect({ value, onChange, inputStyle, compact = false }: Props) {
  const selected   = BANKS.find((b) => b.name === value) ?? null;
  const isCustom   = !!value && !selected;

  const [open, setOpen]           = useState(false);
  const [customMode, setCustomMode] = useState(isCustom);
  const [imgErrors, setImgErrors]   = useState<Record<string, boolean>>({});
  const [dropPos, setDropPos]       = useState<DropPos | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !dropRef.current?.contains(t)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function openDropdown() {
    if (customMode) return;
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const idealH = 320;
      const openAbove = spaceBelow < 200 && spaceAbove > spaceBelow;
      const maxH = Math.min(idealH, openAbove ? spaceAbove : spaceBelow);
      setDropPos({
        top: openAbove ? r.top - Math.min(idealH, spaceAbove) - 4 : r.bottom + 4,
        left: r.left,
        width: r.width,
        maxHeight: maxH,
      });
    }
    setOpen((v) => !v);
  }

  function pickBank(bank: Bank) {
    onChange(bank.name);
    setOpen(false);
  }

  function enterCustom() {
    onChange('');
    setCustomMode(true);
    setOpen(false);
  }

  function backToList() {
    onChange('');
    setCustomMode(false);
  }

  const py = compact ? 'py-2' : 'py-2.5';
  const sz = compact ? 'text-xs' : 'text-sm';

  /* ── Custom text input ── */
  if (customMode) {
    return (
      <div className="flex gap-2">
        <input
          required autoFocus
          placeholder="Enter bank name…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`flex-1 px-3 ${py} ${sz} outline-none`}
          style={inputStyle}
        />
        <button type="button" onClick={backToList}
          className={`px-2.5 ${py} ${sz} rounded-xl flex items-center gap-1 transition-colors hover:bg-white/10 shrink-0`}
          style={{ color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
          ← List
        </button>
      </div>
    );
  }

  /* ── Picker ── */
  return (
    <>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className={`w-full px-3 ${py} ${sz} text-left flex items-center gap-2.5 outline-none`}
        style={inputStyle}
      >
        {selected ? (
          <>
            <BankLogo bank={selected} size={compact ? 18 : 22} imgErrors={imgErrors} onError={(d) => setImgErrors((p) => ({ ...p, [d]: true }))} />
            <span className="flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1" style={{ color: 'var(--color-text-muted)' }}>Select bank…</span>
        )}
        <ChevronIcon open={open} />
      </button>

      {/* Dropdown — fixed to escape stacking contexts */}
      {open && dropPos && (
        <div
          ref={dropRef}
          className="py-1 rounded-xl overflow-y-auto"
          style={{
            ...glass,
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
            maxHeight: dropPos.maxHeight,
            zIndex: 9999,
          }}
        >
          {BANKS.map((bank) => {
            const active = value === bank.name;
            return (
              <button key={bank.name} type="button" onClick={() => pickBank(bank)}
                className={`w-full flex items-center gap-3 px-3 ${compact ? 'py-2' : 'py-2.5'} text-left transition-colors hover:bg-white/10`}
                style={active ? { background: `${bank.color}20` } : {}}>
                <BankLogo bank={bank} size={compact ? 20 : 26} imgErrors={imgErrors} onError={(d) => setImgErrors((p) => ({ ...p, [d]: true }))} />
                <span className={`flex-1 ${sz} font-medium`} style={{ color: active ? bank.color : 'var(--color-text-primary)' }}>
                  {bank.name}
                </span>
                {active && <span style={{ color: bank.color }}>✓</span>}
              </button>
            );
          })}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '4px 0' }} />
          <button type="button" onClick={enterCustom}
            className={`w-full flex items-center gap-2.5 px-3 ${compact ? 'py-2' : 'py-2.5'} ${sz} transition-colors hover:bg-white/10`}
            style={{ color: 'var(--color-text-muted)' }}>
            <span className="w-5 h-5 rounded-lg flex items-center justify-center text-xs shrink-0"
              style={{ background: 'rgba(255,255,255,0.08)' }}>✏️</span>
            Other bank…
          </button>
        </div>
      )}
    </>
  );
}

function BankLogo({ bank, size, imgErrors, onError }: {
  bank: Bank; size: number;
  imgErrors: Record<string, boolean>;
  onError: (domain: string) => void;
}) {
  const failed = imgErrors[bank.domain];
  return (
    <span className="rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, background: failed ? bank.color : 'white' }}>
      {failed ? (
        <span style={{ fontSize: size * 0.38, fontWeight: 700, color: 'white', lineHeight: 1 }}>
          {bank.abbr}
        </span>
      ) : (
        <img src={`https://logo.clearbit.com/${bank.domain}`} alt={bank.name}
          width={size} height={size}
          style={{ objectFit: 'contain', display: 'block' }}
          onError={() => onError(bank.domain)} />
      )}
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--color-text-muted)', flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
