'use client';

import { useMemo, useState } from 'react';
import { projectMillionaire } from '@/lib/tools/millionaire';
import { monthKeyLabel } from '@/lib/goals/pace';
import ToolField, { parseAmount, money0 } from './ToolField';
import { Panel, Stat, Empty } from './ResultCard';

const yearsAndMonths = (months: number) => {
  const y = Math.floor(months / 12), m = months % 12;
  if (y === 0) return `${m} month${m === 1 ? '' : 's'}`;
  return m === 0 ? `${y} year${y === 1 ? '' : 's'}` : `${y} yr ${m} mo`;
};

export default function MillionaireCalculator() {
  const [netWorth, setNetWorth] = useState('25,000');
  const [monthly, setMonthly] = useState('1,000');
  const [ret, setRet] = useState('7');
  const now = useMemo(() => new Date(), []);

  const nw = parseAmount(netWorth);
  const mo = parseAmount(monthly);
  const r = parseAmount(ret);
  const ready = nw !== null && mo !== null && r !== null;

  const result = useMemo(
    () => (ready ? projectMillionaire({ netWorth: nw, monthly: mo, annualReturnPct: r, target: 1_000_000, now }) : null),
    [ready, nw, mo, r, now],
  );
  const plus100 = useMemo(
    () => (ready ? projectMillionaire({ netWorth: nw, monthly: mo + 100, annualReturnPct: r, target: 1_000_000, now }) : null),
    [ready, nw, mo, r, now],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Panel className="flex flex-col gap-4 self-start">
        <ToolField label="Net worth today" prefix="$" value={netWorth} onChange={setNetWorth} hint="Everything you own minus everything you owe. Negative is fine." />
        <ToolField label="You add each month" prefix="$" value={monthly} onChange={setMonthly} hint="Savings plus investments, after spending." />
        <ToolField label="Expected yearly return" suffix="%" value={ret} onChange={setRet} hint="7% is the long-run average for a broad stock index, before inflation." />
      </Panel>

      <div className="flex flex-col gap-5">
        {!result && <Panel><Empty>Enter three numbers to see your date.</Empty></Panel>}
        {result && result.months === 0 && (
          <Panel><p className="text-lg font-semibold" style={{ color: 'var(--color-green)' }}>You are already there. Level 8: Millionaire.</p></Panel>
        )}
        {result && result.months === null && (
          <Panel>
            <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>At this pace, $1M is more than 100 years away.</p>
            <Empty>Add a monthly contribution or a return above zero and the date appears.</Empty>
          </Panel>
        )}
        {result && result.months !== null && result.months > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="You reach $1M" value={monthKeyLabel(result.reachDate!)} tone="good" />
              <Stat label="Time from today" value={yearsAndMonths(result.months)} />
              <Stat
                label="With $100 more a month"
                value={plus100 && plus100.months !== null ? monthKeyLabel(plus100.reachDate!) : '—'}
                sub={plus100 && plus100.months !== null && result.months - plus100.months > 0 ? `${yearsAndMonths(result.months - plus100.months)} sooner` : undefined}
              />
            </div>
            <Panel>
              <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Your milestones</h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>The same ladder Cofre tracks for you on the Goals page.</p>
              <ol className="mt-4 flex flex-col divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {result.milestones.map((m) => (
                  <li key={m.level} className="flex items-center justify-between gap-3 py-2.5 text-sm" style={{ borderColor: 'var(--color-border)' }}>
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                        style={{ background: m.reached ? 'var(--color-green)' : 'var(--color-elevated)', color: m.reached ? '#06240F' : 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                        {m.level}
                      </span>
                      <span className="truncate" style={{ color: 'var(--color-text-primary)' }}>{m.name}</span>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{money0(m.threshold)}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold" style={{ color: m.reached ? 'var(--color-green)' : 'var(--color-text-secondary)' }}>
                      {m.reached ? 'Reached' : m.month ? monthKeyLabel(m.month) : 'Not within 100 years'}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
