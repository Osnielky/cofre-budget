interface Props { type: string; size?: number }

export default function AccountTypeIcon({ type, size = 18 }: Props) {
  if (type === 'credit') return <CreditCardIcon size={size} />;
  if (type === 'checking') return <DebitCardIcon size={size} />;
  const icons: Record<string, string> = { savings: '🏦', investment: '📈', cash: '💵', loan: '🤝' };
  return <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>{icons[type] ?? '🏦'}</span>;
}

function CreditCardIcon({ size }: { size: number }) {
  const h = Math.round(size * 0.65);
  return (
    <svg width={size} height={h} viewBox="0 0 18 12" fill="none">
      {/* Card body */}
      <rect x="0.5" y="0.5" width="17" height="11" rx="1.5"
        fill="rgba(255,255,255,0.18)"
        stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
      {/* Top band */}
      <rect x="0.5" y="0.5" width="17" height="3" rx="1.5"
        fill="rgba(255,255,255,0.65)" />
      {/* EMV chip — gold */}
      <rect x="2" y="5" width="4" height="3" rx="0.7"
        fill="#F5C842" />
      <line x1="4" y1="5" x2="4" y2="8" stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      <line x1="2" y1="6.5" x2="6" y2="6.5" stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
    </svg>
  );
}

function DebitCardIcon({ size }: { size: number }) {
  const h = Math.round(size * 0.65);
  return (
    <svg width={size} height={h} viewBox="0 0 18 12" fill="none">
      {/* Card body */}
      <rect x="0.5" y="0.5" width="17" height="11" rx="1.5"
        fill="rgba(255,255,255,0.18)"
        stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
      {/* Magnetic stripe */}
      <rect x="0.5" y="2.5" width="17" height="3.5"
        fill="rgba(255,255,255,0.72)" />
      {/* Signature strip */}
      <rect x="2" y="8" width="10" height="1.5" rx="0.4"
        fill="rgba(255,255,255,0.22)" />
      {/* CVV box */}
      <rect x="13" y="8" width="3" height="1.5" rx="0.4"
        fill="rgba(255,255,255,0.45)" />
    </svg>
  );
}
