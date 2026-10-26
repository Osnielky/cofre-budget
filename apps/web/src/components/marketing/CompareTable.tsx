import { COFRE_FACTS, pricesCheckedLabel, type Competitor } from '@/lib/marketing/competitors';
import { glassCard } from '@/components/landing/landing-styles';

const ROWS: { label: string; cofre: string; of: (c: Competitor) => string }[] = [
  { label: 'Free plan', cofre: COFRE_FACTS.freePlan, of: (c) => c.freePlan ?? 'None' },
  { label: 'Monthly price', cofre: COFRE_FACTS.monthly, of: (c) => c.monthly },
  { label: 'Yearly price', cofre: COFRE_FACTS.yearly, of: (c) => c.yearly },
  { label: 'Free trial', cofre: `${COFRE_FACTS.trialDays} days on Pro and Elite`, of: (c) => (c.trialDays ? `${c.trialDays} days` : 'None (free tier instead)') },
  { label: 'Bank sync', cofre: COFRE_FACTS.bankSync, of: (c) => c.bankSync },
  { label: 'AI assistant', cofre: COFRE_FACTS.aiAssistant, of: (c) => c.aiAssistant },
  { label: 'Net worth tracking', cofre: COFRE_FACTS.netWorth, of: (c) => c.netWorth },
  { label: 'Platforms', cofre: COFRE_FACTS.platforms, of: (c) => c.platforms },
];

const cell = 'py-3 pr-4 align-top text-sm leading-relaxed';

/** Cofre beside one or more competitors. Prices carry the date they were checked. */
export default function CompareTable({ competitors }: { competitors: Competitor[] }) {
  return (
    <section className="rounded-3xl p-2 sm:p-4" style={glassCard}>
      <div className="overflow-x-auto">
        {/* One competitor fits a phone; the all-in-one table scrolls sideways instead of crushing its columns. */}
        <table className={`w-full border-collapse ${competitors.length > 1 ? 'min-w-[640px]' : ''}`}>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              <th className="py-3 pr-4 pl-3 font-semibold w-[22%]" />
              <th className="py-3 pr-4 font-semibold" style={{ color: 'var(--color-primary)' }}>Cofre</th>
              {competitors.map((c) => <th key={c.slug} className="py-3 pr-4 font-semibold">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} style={{ borderTop: '1px solid var(--color-border)' }}>
                <th scope="row" className={`${cell} pl-3 text-left font-semibold`} style={{ color: 'var(--color-text-primary)' }}>{r.label}</th>
                <td className={cell} style={{ color: 'var(--color-text-primary)' }}>{r.cofre}</td>
                {competitors.map((c) => <td key={c.slug} className={cell} style={{ color: 'var(--color-text-secondary)' }}>{r.of(c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-3 pt-3 pb-1 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        Competitor prices are their public US prices, checked {pricesCheckedLabel()}:{' '}
        {competitors.map((c, i) => (
          <span key={c.slug}>
            {i > 0 && ', '}
            <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">{c.name}</a>
          </span>
        ))}
        . Prices change; check before you buy. Cofre prices are what checkout charges today.
      </p>
    </section>
  );
}
