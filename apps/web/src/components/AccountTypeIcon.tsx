interface Props { type: string; size?: number }

export default function AccountTypeIcon({ type, size = 18 }: Props) {
  if (type === 'credit' || type === 'line_of_credit') return <CreditCardIcon size={size} />;
  if (type === 'checking') return <DebitCardIcon size={size} />;
  if (type === 'investment') return <InvestmentIcon size={size} />;
  const icons: Record<string, string> = {
    savings: '🏦', cash: '💵', loan: '🤝',
    paypal: '🅿️', merchant: '🏪', mortgage: '🏠',
    other_asset: '📦', other_liability: '📉',
  };
  return <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>{icons[type] ?? '🏦'}</span>;
}

function InvestmentIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function CreditCardIcon({ size }: { size: number }) {
  const h = Math.round(size * 0.65);
  return (
    <svg width={size} height={h} viewBox="0 0 18 12" fill="none">
      {/* Card body */}
      <rect x="0.5" y="0.5" width="17" height="11" rx="1.5"
        fill="currentColor" fillOpacity="0.18"
        stroke="currentColor" strokeOpacity="0.85" strokeWidth="1" />
      {/* Top band */}
      <rect x="0.5" y="0.5" width="17" height="3" rx="1.5"
        fill="currentColor" fillOpacity="0.65" />
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
        fill="currentColor" fillOpacity="0.18"
        stroke="currentColor" strokeOpacity="0.85" strokeWidth="1" />
      {/* Magnetic stripe */}
      <rect x="0.5" y="2.5" width="17" height="3.5"
        fill="currentColor" fillOpacity="0.72" />
      {/* Signature strip */}
      <rect x="2" y="8" width="10" height="1.5" rx="0.4"
        fill="currentColor" fillOpacity="0.22" />
      {/* CVV box */}
      <rect x="13" y="8" width="3" height="1.5" rx="0.4"
        fill="currentColor" fillOpacity="0.45" />
    </svg>
  );
}
