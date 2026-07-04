'use client';

import Link from 'next/link';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { Project } from '@/lib/dashboard/types';

export default function ProjectsPanel({ projects, loading }: { projects: Project[]; loading: boolean }) {
  const tc = useThemeColors();
  const activeProjects = projects.filter((p) => p.status !== 'sold');
  const totalInvested  = projects.reduce((s, p) => s + Number(p.costBasis || 0), 0);
  const totalNetGain   = projects.filter((p) => p.netGain != null).reduce((s, p) => s + Number(p.netGain), 0);

  return (
    <Panel colSpan={2} title="Projects" loading={loading}
      subtitle={
        <>
          {activeProjects.length} active · ${fmt(totalInvested)} invested · Net P&L{' '}
          <span style={{ color: totalNetGain >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>
            {totalNetGain >= 0 ? '+' : '−'}${fmt(Math.abs(totalNetGain))}
          </span>
        </>
      }
      legend={<Link href="/projects" className="text-xs font-semibold hover:opacity-80" style={{ color: 'var(--color-primary)' }}>View all →</Link>}>
      {projects.length === 0 ? (
        <PanelEmpty message="No projects yet. Track flips, rentals, or side ventures from the Projects page." />
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {activeProjects.slice(0, 4).map(p => {
            const c    = p.color || tc.violet;
            const gain = p.netGain;
            const roi  = p.roi;
            return (
              <Link href="/projects" key={p.id}
                className="flex flex-col gap-2.5 p-4 rounded-xl transition-all hover:brightness-110"
                style={{ background: `${c}0d`, border: `1px solid ${c}28` }}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{p.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{p.name}</p>
                    <p className="text-[10px] capitalize" style={{ color: 'var(--color-text-muted)' }}>{p.type}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg py-1.5" style={{ background: 'var(--color-elevated)' }}>
                    <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Invested</p>
                    <p className="text-xs font-bold mt-0.5" style={{ color: c }}>${fmt(Number(p.costBasis))}</p>
                  </div>
                  <div className="rounded-lg py-1.5" style={{ background: 'var(--color-elevated)' }}>
                    <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>P&L</p>
                    <p className="text-xs font-bold mt-0.5" style={{ color: gain != null ? (gain >= 0 ? 'var(--color-green)' : 'var(--color-rose)') : 'var(--color-text-muted)' }}>
                      {gain != null ? `${gain >= 0 ? '+' : '−'}$${Math.abs(gain).toFixed(0)}` : '—'}
                    </p>
                  </div>
                </div>
                {roi != null && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span style={{ color: 'var(--color-text-muted)' }}>ROI</span>
                    <span className="font-bold" style={{ color: roi >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>
                      {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
