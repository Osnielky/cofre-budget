'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

type Category = 'all' | 'email' | 'banks' | 'shopping' | 'payments' | 'storage';

/* Bank integrations live in Settings → Bank Accounts (Plaid); no 'banks' filter here until
   a bank integration card actually ships in this tab. */
const FILTERS: { id: Category; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'email', label: 'Email & Receipts' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'payments', label: 'Payments' },
  { id: 'storage', label: 'Storage' },
];

/* ── Brand marks (simplified, recognizable) ── */
const GmailMark = () => (
  <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="10" width="40" height="28" rx="4" fill="#FFFFFF" />
    <path d="M4 14a4 4 0 0 1 6.4-3.2L24 21l13.6-10.2A4 4 0 0 1 44 14v0L24 29 4 14Z" fill="#EA4335" />
    <path d="M4 14v20a4 4 0 0 0 4 4h4V20l-8-6Z" fill="#4285F4" />
    <path d="M44 14v20a4 4 0 0 1-4 4h-4V20l8-6Z" fill="#34A853" />
    <path d="M12 20v18H8a4 4 0 0 1-4-4V14l8 6Z" fill="#C5221F" opacity="0.85" />
    <path d="M36 20v18h4a4 4 0 0 0 4-4V14l-8 6Z" fill="#FBBC04" />
  </svg>
);
const OutlookMark = () => (
  <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="16" y="8" width="28" height="32" rx="3" fill="#1066B8" />
    <rect x="20" y="14" width="20" height="8" fill="#28A8EA" />
    <rect x="4" y="12" width="24" height="24" rx="4" fill="#0F78D4" />
    <circle cx="16" cy="24" r="7" fill="none" stroke="#fff" strokeWidth="3.5" />
  </svg>
);
const AmazonMark = () => (
  <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
    <text x="24" y="27" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--color-text-primary)" fontFamily="inherit">a</text>
    <path d="M10 33c8 6 20 6 28-1" fill="none" stroke="#FF9900" strokeWidth="3" strokeLinecap="round" />
    <path d="M38 32l1.5-4 1 4.5-2.5-.5Z" fill="#FF9900" />
  </svg>
);
const PayPalMark = () => (
  <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M17 8h12c6 0 9 3.5 8 9-1 5.5-5 8-11 8h-5l-2 12h-7l5-29Z" fill="#003087" />
    <path d="M22 14h11c5 0 7.5 3 6.7 7.5C38.8 26.5 35 29 30 29h-4.5L23.5 40H17l5-26Z" fill="#009CDE" opacity="0.9" />
  </svg>
);
const StripeMark = () => (
  <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="6" y="6" width="36" height="36" rx="8" fill="#635BFF" />
    <path d="M24 15c-5 0-8 2.4-8 6 0 6.8 10 4.8 10 8 0 1.3-1.2 2-3 2-2.4 0-5.2-1-7-2.2v5.4c2 1 4.6 1.8 7 1.8 5.2 0 8.5-2.5 8.5-6.3 0-7.2-10-5-10-8 0-1.1 1-1.7 2.7-1.7 2.1 0 4.8.7 6.8 1.8v-5.2c-2-.9-4.4-1.6-7-1.6Z" fill="#fff" />
  </svg>
);
const DriveMark = () => (
  <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M17 8h14l13 22h-14L17 8Z" fill="#FFCF63" />
    <path d="M17 8 4 30l7 12 13-22-7-12Z" fill="#11A861" />
    <path d="M11 42h26l7-12H18l-7 12Z" fill="#2684FC" />
  </svg>
);
const AppleMailMark = () => (
  <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="5" y="5" width="38" height="38" rx="9" fill="url(#amg)" />
    <defs>
      <linearGradient id="amg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1D9BF6" />
        <stop offset="100%" stopColor="#1265E2" />
      </linearGradient>
    </defs>
    <rect x="11" y="15" width="26" height="18" rx="3" fill="none" stroke="#fff" strokeWidth="2.5" />
    <path d="M11 17l13 10 13-10" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
  </svg>
);
const PlusMark = () => (
  <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="6" y="6" width="36" height="36" rx="9" fill="color-mix(in srgb, var(--color-violet) 18%, transparent)" />
    <path d="M24 15v18M15 24h18" stroke="var(--color-violet)" strokeWidth="3.5" strokeLinecap="round" />
  </svg>
);

/* ── Small utility icons ── */
function Icon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const I_LOCK   = 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4';
const I_SHIELD = 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z';
const I_USER   = 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1';
const I_OFF    = 'M12 2v10 M18.4 6.6a9 9 0 1 1-12.8 0';
const I_LINK   = 'M13.8 10.2a4 4 0 0 0-5.6 0l-4 4a4 4 0 1 0 5.6 5.6l1.1-1.1 M10.2 13.8a4 4 0 0 0 5.6 0l4-4a4 4 0 0 0-5.6-5.6l-1.1 1.1';
const I_CLOCK  = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 3';
const I_SYNC   = 'M21 12a9 9 0 1 1-2.6-6.4 M21 3v5h-5';

interface GmailStatus { connected: boolean; email?: string; connectedAt?: string }

interface IntegrationDef {
  key: string;
  name: string;
  category: Exclude<Category, 'all'>;
  categoryLabel: string;
  description: string;
  mark: () => React.ReactNode;
  live?: boolean;
}

const INTEGRATIONS: IntegrationDef[] = [
  { key: 'gmail', name: 'Gmail', category: 'email', categoryLabel: 'Email', live: true, mark: GmailMark,
    description: 'Automatically find receipts, invoices, subscriptions, and purchase confirmations.' },
  { key: 'outlook', name: 'Outlook', category: 'email', categoryLabel: 'Email', mark: OutlookMark,
    description: 'Import important emails, receipts, and billing information.' },
  { key: 'amazon', name: 'Amazon', category: 'shopping', categoryLabel: 'Shopping', mark: AmazonMark,
    description: 'Track orders, deliveries and import your purchases.' },
  { key: 'paypal', name: 'PayPal', category: 'payments', categoryLabel: 'Payments', mark: PayPalMark,
    description: 'Automatically import payments, refunds and transactions.' },
  { key: 'stripe', name: 'Stripe', category: 'payments', categoryLabel: 'Payments', mark: StripeMark,
    description: 'Sync your Stripe transactions and payouts.' },
  { key: 'gdrive', name: 'Google Drive', category: 'storage', categoryLabel: 'Storage', mark: DriveMark,
    description: 'Attach and organize your financial documents.' },
  { key: 'applemail', name: 'Apple Mail', category: 'email', categoryLabel: 'Email', mark: AppleMailMark,
    description: 'Import receipts and invoices from Apple Mail.' },
];

const card: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--color-elevated) 80%, transparent)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

function CategoryBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
      style={{ background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', color: 'var(--color-primary)' }}>
      {label}
    </span>
  );
}

interface Props {
  status: GmailStatus | null;
  loading: boolean;
  onDisconnect: () => void;
  onManageData: () => void;
}

export default function IntegrationsTab({ status, loading, onDisconnect, onManageData }: Props) {
  const [filter, setFilter] = useState<Category>('all');
  const connected = status?.connected ? 1 : 0;
  const visible = INTEGRATIONS.filter((i) => filter === 'all' || i.category === filter);
  const connectedAt = status?.connectedAt
    ? new Date(status.connectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Integrations</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Connect external services to automatically import data, find receipts, and keep your finances in sync.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
              style={connected > 0
                ? { background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)', color: 'var(--color-green)' }
                : { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <Icon d={I_LINK} size={12} /> {connected} connected
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <Icon d={I_CLOCK} size={12} /> {connected > 0 && connectedAt ? `Connected ${connectedAt}` : 'Last sync: Never'}
            </span>
          </div>
        </div>

        {/* Category filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
              style={filter === f.id
                ? { background: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 35%, transparent)', color: 'var(--color-primary)' }
                : { background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Integration grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map((integ) => integ.live ? (
            /* ── Gmail (live) featured card ── */
            <div key={integ.key} className="card-lift rounded-2xl p-5 flex flex-col gap-3 md:col-span-2" style={card}>
              <div className="flex items-start gap-3.5">
                <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--color-text-primary) 6%, transparent)', border: '1px solid var(--color-border)' }}>
                  <GmailMark />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-[15px] flex items-center gap-2">Gmail <CategoryBadge label="Email" /></p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{integ.description}</p>
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    {[
                      { label: 'Receipts', color: 'var(--color-green)' },
                      { label: 'Bills', color: 'var(--color-amber)' },
                      { label: 'Subscriptions', color: 'var(--color-sky)' },
                    ].map((c) => (
                      <span key={c.label} className="flex items-center gap-1.5 text-[10.5px] font-semibold px-2 py-1 rounded-md"
                        style={{ background: `color-mix(in srgb, ${c.color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${c.color} 25%, transparent)`, color: c.color }}>
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 flex-wrap" style={{ borderTop: '1px solid var(--color-border)' }}>
                <span className="flex items-center gap-2 text-xs font-medium" style={{ color: status?.connected ? 'var(--color-green)' : 'var(--color-text-muted)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: status?.connected ? 'var(--color-green)' : 'var(--color-text-muted)' }} />
                  {loading ? 'Checking…' : status?.connected ? status.email : 'Not connected'}
                </span>
                {status?.connected ? (
                  <button onClick={onDisconnect}
                    className="text-xs px-4 py-2 rounded-xl font-semibold transition-all hover:brightness-110 cursor-pointer"
                    style={{ background: 'color-mix(in srgb, var(--color-rose) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)', color: 'var(--color-rose)' }}>
                    Disconnect
                  </button>
                ) : (
                  <a href={`${API}/gmail/connect`}
                    className="text-xs px-4 py-2 rounded-xl font-semibold no-underline transition-all hover:brightness-110"
                    style={{ background: 'var(--color-violet)', color: '#fff', boxShadow: '0 0 16px color-mix(in srgb, var(--color-violet) 40%, transparent)' }}>
                    Connect Gmail
                  </a>
                )}
              </div>

              <div className="flex items-center gap-5 flex-wrap text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                <span className="flex items-center gap-1.5"><Icon d={I_LOCK} size={12} /> Read-only access</span>
                <span className="flex items-center gap-1.5"><Icon d={I_SHIELD} size={12} /> You control your data</span>
                <span className="flex items-center gap-1.5"><Icon d={I_OFF} size={12} /> Disconnect anytime</span>
              </div>
            </div>
          ) : (
            /* ── Coming-soon card ── */
            <div key={integ.key} className="card-lift rounded-2xl p-5 flex flex-col gap-3" style={card}>
              <div className="flex items-start gap-3.5">
                <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--color-text-primary) 6%, transparent)', border: '1px solid var(--color-border)' }}>
                  {integ.mark()}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-[15px] flex items-center gap-2">{integ.name} <CategoryBadge label={integ.categoryLabel} /></p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{integ.description}</p>
                </div>
              </div>
              <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full w-fit mt-auto"
                style={{ background: 'color-mix(in srgb, var(--color-amber) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-amber) 28%, transparent)', color: 'var(--color-amber)' }}>
                Coming soon
              </span>
            </div>
          ))}

          {/* Request an integration */}
          <div className="card-lift rounded-2xl p-5 flex items-start gap-3.5" style={card}>
            <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'color-mix(in srgb, var(--color-text-primary) 6%, transparent)', border: '1px solid var(--color-border)' }}>
              <PlusMark />
            </span>
            <div>
              <p className="font-bold text-[15px]">More integrations</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>We&apos;re always adding new integrations.</p>
              <a href="mailto:support@cofre.app?subject=Integration%20request" className="text-xs font-semibold mt-2 inline-block" style={{ color: 'var(--color-violet)' }}>
                Request an integration →
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right rail ── */}
      <div className="w-full xl:w-72 shrink-0 flex flex-col gap-4">
        {/* Privacy panel */}
        <div className="rounded-2xl p-5 flex flex-col items-center text-center gap-3" style={card}>
          <span className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--color-violet) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--color-violet) 35%, transparent)', color: 'var(--color-violet)', boxShadow: '0 0 18px color-mix(in srgb, var(--color-violet) 25%, transparent)' }}>
            <Icon d={I_SHIELD} size={26} />
          </span>
          <p className="font-bold text-[15px]">Your data stays private</p>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Cofre only imports the information needed to identify transactions and receipts.
            Your connections are encrypted and can be removed at any time.
          </p>
          <div className="flex flex-col gap-2 w-full text-left text-xs pt-1" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="flex items-center gap-2"><Icon d={I_LOCK} size={13} /> Read-only access</span>
            <span className="flex items-center gap-2"><Icon d={I_SHIELD} size={13} /> Bank-level encryption</span>
            <span className="flex items-center gap-2"><Icon d={I_USER} size={13} /> You&apos;re in control</span>
          </div>
          <button onClick={onManageData} className="text-xs font-semibold mt-1 cursor-pointer" style={{ color: 'var(--color-violet)' }}>
            Manage data permissions →
          </button>
        </div>

        {/* Recent activity */}
        <div className="rounded-2xl p-5 flex flex-col gap-3" style={card}>
          <p className="font-bold text-[14px]">Recent integration activity</p>
          {status?.connected ? (
            <>
              <div className="flex items-center gap-2.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--color-text-primary) 6%, transparent)' }}>
                  <GmailMark />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{status.email}</p>
                  <p>{connectedAt ? `Connected ${connectedAt}` : 'Connected'}</p>
                </div>
                <span className="ml-auto w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px]"
                  style={{ background: 'var(--color-green)', color: '#08111F' }}>✓</span>
              </div>
              <a href="/receipts"
                className="flex items-center justify-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl no-underline transition-all hover:brightness-110"
                style={{ border: '1px solid color-mix(in srgb, var(--color-violet) 35%, transparent)', color: 'var(--color-violet)' }}>
                <Icon d={I_SYNC} size={13} /> Sync receipts now
              </a>
            </>
          ) : (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              No activity yet. Connect an integration to start importing receipts automatically.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
