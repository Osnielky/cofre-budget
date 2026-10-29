import { describe, it, expect } from 'vitest';
import { headlineFigures, money, OverviewProject, portfolioTotals, projectNet, relativeDay, sparklinePoints } from './overview';

function project(over: Partial<OverviewProject>): OverviewProject {
  return { id: 'p', type: 'vehicle', status: 'active', purchasePrice: 0, salePrice: null, expenses: 0, income: 0, costBasis: 0, netGain: null, roi: null, txCount: 0, ...over };
}

describe('money', () => {
  it('rounds to whole dollars and signs on request', () => {
    expect(money(4116.02)).toBe('$4,116');
    expect(money(-290.5, true)).toBe('-$291');
    expect(money(484, true)).toBe('+$484');
    expect(money(0, true)).toBe('$0');
  });
});

describe('portfolioTotals', () => {
  it('adds cost basis, income and expenses across projects, counting a sale price as income', () => {
    const t = portfolioTotals([
      project({ costBasis: 4116.02, expenses: 4116.02, income: 4600 }),
      project({ type: 'business', costBasis: 349, expenses: 349, income: 1559 }),
      project({ status: 'sold', purchasePrice: 2000, expenses: 500, costBasis: 2500, salePrice: 3100, netGain: 600, roi: 24 }),
    ]);
    expect(t).toEqual({ active: 2, closed: 1, costBasis: 6965.02, income: 9259, expenses: 6965.02, net: 2293.98 });
  });
});

describe('projectNet', () => {
  it('is income minus every cost, or the recorded gain once sold', () => {
    expect(projectNet(project({ purchasePrice: 2000, expenses: 500, income: 300 }))).toBe(-2200);
    expect(projectNet(project({ status: 'sold', netGain: 600 }))).toBe(600);
  });
});

describe('headlineFigures', () => {
  it('a held vehicle shows cost basis, income and how long it has been held', () => {
    expect(headlineFigures(project({ costBasis: 4116.02, expenses: 4116.02, income: 4600, purchaseDate: '2026-03-05' })).map((f) => [f.label, f.value, f.tone])).toEqual([
      ['Cost basis', '$4,116', 'flat'], ['Income', '+$4,600', 'up'], ['Held since', 'Mar 2026', 'flat'],
    ]);
    expect(headlineFigures(project({ costBasis: 6500 }))[2]).toEqual({ label: 'Held since', value: '—', tone: 'flat' });
  });
  it('a sold asset shows the gain, the sale price and ROI', () => {
    expect(headlineFigures(project({ status: 'sold', salePrice: 3100, netGain: -400, roi: -11.4 })).map((f) => [f.label, f.value, f.tone])).toEqual([
      ['Net gain', '-$400', 'down'], ['Sold for', '$3,100', 'flat'], ['ROI', '-11%', 'down'],
    ]);
  });
  it('a business shows net, income and ROI on its cost basis', () => {
    expect(headlineFigures(project({ type: 'service', costBasis: 349, expenses: 349, income: 1559 })).map((f) => [f.label, f.value])).toEqual([
      ['Net', '+$1,210'], ['Income', '$1,559'], ['ROI', '+347%'],
    ]);
  });
  it('a trading project shows realized P&L and win rate once performance is known, else its cash result', () => {
    const p = project({ type: 'trading', costBasis: 2812, expenses: 2812, income: 5760.5, accounts: [{ id: 'a' }, { id: 'b' }] });
    expect(headlineFigures(p, { realizedPnl: -1240.3, winRate: 54.2, closed: 118 }).map((f) => [f.label, f.value, f.tone])).toEqual([
      ['Realized P&L', '-$1,240', 'down'], ['Win rate', '54.2%', 'flat'], ['Accounts', '2 · 118 closed', 'flat'],
    ]);
    expect(headlineFigures(p, null).map((f) => [f.label, f.value])).toEqual([
      ['Net result', '+$2,949'], ['Payouts & profits', '$5,761'], ['Accounts', '2'],
    ]);
    expect(headlineFigures({ ...p, accounts: [] }, null)[2]).toEqual({ label: 'Costs', value: '$2,812', tone: 'flat' });
  });
});

describe('sparklinePoints', () => {
  it('accumulates monthly net and is empty when nothing moved', () => {
    expect(sparklinePoints([{ net: 100 }, { net: -30 }, { net: 0 }, { net: 50 }])).toEqual([100, 70, 70, 120]);
    expect(sparklinePoints([{ net: 0 }, { net: 0 }])).toEqual([]);
    expect(sparklinePoints(undefined)).toEqual([]);
  });
});

describe('relativeDay', () => {
  const now = new Date('2026-10-29T15:00:00');
  it('reads like a person would say it', () => {
    expect(relativeDay(null)).toBe('No activity yet');
    expect(relativeDay('2026-10-29', now)).toBe('Today');
    expect(relativeDay('2026-10-28', now)).toBe('Yesterday');
    expect(relativeDay('2026-10-10', now)).toBe('19 days ago');
    expect(relativeDay('2026-07-20', now)).toBe('3 mo ago');
    expect(relativeDay('2024-07-20', now)).toBe('2 yr ago');
  });
});
