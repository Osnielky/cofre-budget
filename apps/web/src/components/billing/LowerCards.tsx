'use client';

import { PLAN_PRICES } from '@/lib/plans';
import { yearlySavings } from '@/lib/billing/derive';
import { PAID_FEATURES, type BillingOverview, type SubscriptionInfo } from '@/lib/billing/types';
import type { BillingActions } from './TopCards';
import { BillingCard, Icon, IconChip, Pill, fmtMoney, outlineBtn, type IconName } from './ui';

const SUPPORT_EMAIL = 'info@osmioservices.com';
const TIER = { pro: 'Pro', elite: 'Elite' } as const;

const STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: 'Paid', color: 'var(--color-green)' },
  open: { label: 'Due', color: 'var(--color-amber)' },
  draft: { label: 'Draft', color: 'var(--color-text-muted)' },
  void: { label: 'Void', color: 'var(--color-text-muted)' },
  uncollectible: { label: 'Unpaid', color: 'var(--color-rose)' },
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function InvoicesCard({ overview, actions }: { overview: BillingOverview | null; actions: BillingActions }) {
  const invoices = overview?.invoices ?? [];
  const status = (s: string | null) => STATUS[s ?? ''] ?? { label: s ?? '—', color: 'var(--color-text-muted)' };
  const download = (inv: BillingOverview['invoices'][number]) => {
    const href = inv.pdfUrl ?? inv.hostedUrl;
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Download invoice from ${shortDate(inv.date)}`}
        className="inline-flex p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,currentColor_10%,transparent)]" style={{ color: 'var(--color-primary)' }}>
        <Icon name="download" size={17} />
      </a>
    ) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  };

  return (
    <BillingCard title="Recent invoices"
      action={<button type="button" onClick={actions.openPortal} className="text-xs font-semibold inline-flex items-center gap-1 cursor-pointer hover:underline" style={{ color: 'var(--color-primary)' }}>View all invoices <Icon name="arrow" size={13} /></button>}>
      {invoices.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>No invoices yet — your first one appears after your first charge.</p>
      ) : (
        <>
          {/* Table from sm up */}
          <table className="hidden sm:table w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <th scope="col" className="font-semibold py-2 pl-2">Date</th>
                <th scope="col" className="font-semibold py-2">Plan</th>
                <th scope="col" className="font-semibold py-2">Amount</th>
                <th scope="col" className="font-semibold py-2">Status</th>
                <th scope="col" className="font-semibold py-2 text-center">Download</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td className="py-2.5 pl-2 whitespace-nowrap" style={{ color: 'var(--color-text-primary)' }}>
                    <span className="inline-flex items-center gap-2"><span style={{ color: 'var(--color-text-muted)' }}><Icon name="file" size={16} /></span>{shortDate(inv.date)}</span>
                  </td>
                  <td className="py-2.5 pr-2 max-w-48 truncate" style={{ color: 'var(--color-text-secondary)' }} title={inv.description ?? ''}>{inv.description ?? '—'}</td>
                  <td className="py-2.5 tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{fmtMoney(inv.total, inv.currency)}</td>
                  <td className="py-2.5"><Pill color={status(inv.status).color}>{status(inv.status).label}</Pill></td>
                  <td className="py-2.5 text-center">{download(inv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Stacked list on phones */}
          <ul className="sm:hidden flex flex-col">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{shortDate(inv.date)} · {fmtMoney(inv.total, inv.currency)}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{inv.description ?? '—'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0"><Pill color={status(inv.status).color}>{status(inv.status).label}</Pill>{download(inv)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </BillingCard>
  );
}

export function ComparePlansCard({ sub, actions }: { sub: SubscriptionInfo; actions: BillingActions }) {
  const tiers = ['pro', 'elite'] as const;
  const per = sub.interval === 'month' ? 'month' : 'year';
  return (
    <BillingCard title="Compare plans" action={sub.interval === 'month' ? <Pill color="var(--color-green)">Save 20% with yearly</Pill> : undefined}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiers.map((t) => {
          const accent = t === 'elite' ? 'var(--color-amber)' : 'var(--color-primary)';
          const current = sub.tier === t;
          return (
            <div key={t} className="rounded-xl p-4 flex flex-col gap-3"
              style={{ border: `1px solid ${current ? accent : 'var(--color-border)'}`, background: `color-mix(in srgb, ${accent} ${current ? 10 : 4}%, transparent)` }}>
              <div className="flex items-center gap-2.5">
                <IconChip name="crown" color={accent} size={34} />
                <div className="min-w-0">
                  <p className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                    {TIER[t]} {current && <Pill color={accent}>Current</Pill>}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    <span className="font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{fmtMoney(PLAN_PRICES[t][sub.interval])}</span> / {per}
                  </p>
                </div>
              </div>
              <ul className="flex flex-col gap-1.5">
                {PAID_FEATURES[t].map((f) => (
                  <li key={f.title} className="flex items-start gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    <span className="mt-0.5 shrink-0" style={{ color: 'var(--color-green)' }}><Icon name="check" size={14} /></span>
                    <span>{f.title}{f.icon === 'ai' ? ` · ${f.detail}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {!sub.cancelAtPeriodEnd && (
        <button type="button" disabled={actions.busy}
          onClick={() => actions.switchTier(sub.tier === 'pro' ? 'elite' : 'pro', sub.interval)}
          className={`${sub.tier === 'pro' ? 'btn-gold' : ''} w-full py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50`}
          style={sub.tier === 'pro' ? undefined : outlineBtn}>
          {sub.tier === 'pro' ? 'Upgrade to Elite' : 'Downgrade to Pro'}
        </button>
      )}
    </BillingCard>
  );
}

const FEATURE_COLOR: Record<string, string> = {
  base: 'var(--color-green)', sync: 'var(--color-sky)', bank: 'var(--color-violet)', ai: 'var(--color-amber)',
};

export function IncludedCard({ sub }: { sub: SubscriptionInfo }) {
  return (
    <BillingCard title={`What's included in ${TIER[sub.tier]}`}>
      <ul className="flex flex-col">
        {PAID_FEATURES[sub.tier].map((f, i) => (
          <li key={f.title} className="flex items-center gap-3 py-2.5" style={i ? { borderTop: '1px solid var(--color-border)' } : undefined}>
            <IconChip name={f.icon as IconName} color={FEATURE_COLOR[f.icon]} size={38} />
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{f.title}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{f.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </BillingCard>
  );
}

/** Only for monthly plans: the real yearly saving and a one-click switch. */
export function YearlyBanner({ sub, actions }: { sub: SubscriptionInfo; actions: BillingActions }) {
  const s = yearlySavings(sub.tier);
  return (
    <section className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 relative overflow-hidden min-w-0"
      style={{ border: 'var(--glass-border)', background: 'linear-gradient(110deg, color-mix(in srgb, var(--color-sky) 12%, var(--color-surface)) 0%, var(--color-surface) 65%)' }}>
      <IconChip name="tag" color="var(--color-amber)" size={48} />
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Save {s.pct}% with a yearly plan</h3>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {TIER[sub.tier]} yearly is {fmtMoney(PLAN_PRICES[sub.tier].year)} a year instead of {fmtMoney(PLAN_PRICES[sub.tier].month * 12)} — you save {fmtMoney(s.amount)}.
        </p>
      </div>
      <svg viewBox="0 0 200 60" className="hidden md:block w-44 h-14 shrink-0" aria-hidden="true">
        <path d="M0 45 C30 40 45 20 70 30 S110 55 130 40 S170 10 200 8" fill="none" stroke="var(--color-sky)" strokeWidth="2.5" />
        {[[70, 30], [130, 40], [200, 8]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.5" fill="var(--color-sky)" />)}
      </svg>
      {!sub.cancelAtPeriodEnd && (
        <button type="button" disabled={actions.busy} onClick={() => actions.switchTier(sub.tier, 'year')}
          className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
          style={{ border: '1px solid var(--color-primary)', color: 'var(--color-text-primary)' }}>
          Switch to yearly <Icon name="arrow" size={15} />
        </button>
      )}
    </section>
  );
}

export function BillingHelpCard({ actions }: { actions: BillingActions }) {
  const items: { icon: IconName; title: string; detail: string; href?: string; onClick?: () => void }[] = [
    { icon: 'chat', title: 'Contact support', detail: 'Email our team', href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Cofre billing question')}` },
    { icon: 'book', title: 'All invoices', detail: 'Full history in Stripe', onClick: actions.openPortal },
    { icon: 'file', title: 'Download receipts', detail: 'Receipts for past charges', onClick: actions.openPortal },
  ];
  return (
    <BillingCard title="Need help with billing?">
      <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-3 gap-3">
        {items.map((it) => {
          const inner = (
            <>
              <span style={{ color: 'var(--color-primary)' }}><Icon name={it.icon} size={18} /></span>
              <span className="min-w-0 text-left">
                <span className="block text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{it.title}</span>
                <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{it.detail}</span>
              </span>
            </>
          );
          const cls = 'flex items-start gap-2 rounded-xl p-2.5 cursor-pointer hover:bg-[color-mix(in_srgb,currentColor_6%,transparent)]';
          return it.href
            ? <a key={it.title} href={it.href} className={cls}>{inner}</a>
            : <button key={it.title} type="button" onClick={it.onClick} className={cls}>{inner}</button>;
        })}
      </div>
    </BillingCard>
  );
}
