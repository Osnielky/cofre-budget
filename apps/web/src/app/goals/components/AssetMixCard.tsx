'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '@/components/dashboard/Panel';
import { makeChartTheme } from '@/components/dashboard/chartTheme';
import { ACCOUNT_TYPES } from '@/lib/accountTypes';
import type { AssetMixGroup } from '@/lib/dashboard/derive';
import { money } from '../format';

/**
 * Color is keyed to each group's account-type identity (a fixed order), never
 * to its rank after sorting by value — otherwise the same type (e.g.
 * "Checking") could repaint on a different load just because balances shifted
 * the sort order. "receivables" (money owed to you) isn't a real account type,
 * so it gets a fixed slot at the end.
 */
const ASSET_TYPE_ORDER = [...ACCOUNT_TYPES.filter((t) => t.kind === 'asset').map((t) => t.value), 'receivables'];

function usePalette() {
  const tc = useThemeColors();
  const colors = [tc.green, tc.sky, tc.violet, tc.orange, tc.amber];
  return (key: string) => {
    const idx = ASSET_TYPE_ORDER.indexOf(key);
    return colors[(idx >= 0 ? idx : 0) % colors.length];
  };
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className="transition-transform shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

interface Props {
  groups: AssetMixGroup[];
  total: number;
  loading: boolean;
}

export default function AssetMixCard({ groups, total, loading }: Props) {
  const palette = usePalette();
  const th = makeChartTheme(useThemeColors());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const colored = groups.map((g) => ({ ...g, color: palette(g.key) }));
  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  return (
    <Panel title="Your Asset Mix" subtitle="Every account, grouped by type" loading={loading}>
      {colored.length === 0 ? (
        <PanelEmpty message={<>No asset accounts yet — <Link href="/settings" className="underline">add one in Settings</Link>.</>} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col xl:flex-row items-center xl:items-start gap-5">
            <div className="relative shrink-0 mx-auto xl:mx-0" style={{ width: 170, height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={colored} dataKey="value" nameKey="label" innerRadius={54} outerRadius={82}
                    paddingAngle={2} cornerRadius={5} strokeWidth={0}>
                    {colored.map((g) => <Cell key={g.key} fill={g.color} />)}
                  </Pie>
                  <Tooltip {...th.tooltip} formatter={(v: unknown, name: unknown) => [money(Number(v)), String(name)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Total assets</p>
                <p className="text-base font-bold tabular-nums">{money(total)}</p>
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1 self-stretch">
              {colored.map((g) => {
                const open = !collapsed.has(g.key);
                return (
                  <div key={g.key} className="flex flex-col">
                    <button onClick={() => toggle(g.key)}
                      className="flex items-center gap-2.5 min-w-0 py-1.5 cursor-pointer text-left">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                      <span className="text-xs font-semibold truncate w-24 sm:w-36 min-w-0" style={{ color: 'var(--color-text-primary)' }}>{g.label}</span>
                      <span className="text-xs font-bold tabular-nums shrink-0">{money(g.value)}</span>
                      <span className="text-[10px] w-10 text-right shrink-0" style={{ color: 'var(--color-text-muted)' }}>{g.pct}%</span>
                      {g.accounts.length > 0 && <ChevronIcon open={open} />}
                    </button>
                    {open && g.accounts.length > 0 && (
                      <div className="flex flex-col gap-1 pb-2 pl-5" style={{ borderLeft: '1px solid var(--color-border)', marginLeft: 4 }}>
                        {g.accounts.map((a) => (
                          <div key={a.id} className="flex justify-between gap-2 text-[11px] pl-2 min-w-0">
                            <span className="truncate min-w-0" style={{ color: 'var(--color-text-secondary)' }}>{a.label}</span>
                            <span className="tabular-nums font-semibold shrink-0">{money(a.value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
