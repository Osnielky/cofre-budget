'use client';

import { useState } from 'react';
import { compareToRule } from '@/lib/tools/rule';
import ToolField, { parseAmount, cents0 } from './ToolField';
import { Panel, Stat, Empty } from './ResultCard';

const BUCKETS = [
  { key: 'needs', label: 'Needs · 50%', what: 'Rent or mortgage, groceries, utilities, insurance, minimum debt payments, transport to work.' },
  { key: 'wants', label: 'Wants · 30%', what: 'Dining out, streaming, travel, hobbies, upgrades you could skip.' },
  { key: 'savings', label: 'Savings · 20%', what: 'Emergency fund, retirement, investments, extra debt payments.' },
] as const;

export default function RuleCalculator() {
  const [income, setIncome] = useState('5,000');
  const [needs, setNeeds] = useState('');
  const [wants, setWants] = useState('');

  const inc = parseAmount(income);
  const n = needs.trim() === '' ? null : parseAmount(needs);
  const w = wants.trim() === '' ? null : parseAmount(wants);
  const c = inc !== null ? compareToRule(inc, n, w) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Panel className="flex flex-col gap-4 self-start">
        <ToolField label="Monthly take-home pay" prefix="$" value={income} onChange={setIncome} hint="After taxes, what lands in your account." />
        <ToolField label="Needs you spend now (optional)" prefix="$" value={needs} onChange={setNeeds} placeholder="e.g. 2,800" />
        <ToolField label="Wants you spend now (optional)" prefix="$" value={wants} onChange={setWants} placeholder="e.g. 1,200" />
      </Panel>

      <div className="flex flex-col gap-5">
        {!c && <Panel><Empty>Enter your take-home pay.</Empty></Panel>}
        {c && (
          <div className="grid gap-3 sm:grid-cols-3">
            {BUCKETS.map((b) => {
              const x = c[b.key];
              const over = x.delta !== null && x.delta > 0;
              const under = x.delta !== null && x.delta < 0;
              const sub = x.actual === null
                ? b.what
                : b.key === 'savings'
                  ? (under ? `You have ${cents0(Math.abs(x.delta!))} less left than the rule` : over ? `${cents0(x.delta!)} more than the rule` : 'Right on the rule')
                  : (over ? `You spend ${cents0(x.delta!)} over` : under ? `${cents0(Math.abs(x.delta!))} under, nice` : 'Right on the rule');
              const tone = x.actual === null ? 'default' : b.key === 'savings' ? (under ? 'bad' : 'good') : (over ? 'warn' : 'good');
              return <Stat key={b.key} label={b.label} value={cents0(x.target)} sub={sub} tone={tone} />;
            })}
          </div>
        )}
        {c && c.savings.actual !== null && c.savings.actual < 0 && (
          <Panel>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Needs and wants add up to more than your pay, so nothing is left to save. The usual first move is the wants column: streaming, delivery and subscriptions are where most people find the first few hundred dollars.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
