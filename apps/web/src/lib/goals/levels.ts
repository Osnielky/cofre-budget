/** Mirrors NET_WORTH_TARGET in apps/api/src/net-worth-goal/net-worth-goal.math.ts.
    The goal endpoint also returns `target`; this is the ladder's own ceiling. */
export const NET_WORTH_TARGET = 1_000_000;

export interface Level {
  n: number;
  /** Net worth needed to reach this level. */
  threshold: number;
  name: string;
  /** Short label for the node, e.g. "$25K". */
  short: string;
}

/** The milestone ladder to $1M. Each level roughly doubles-to-2.5x the last, so
    early wins come quickly and the later ones stay meaningful. */
export const LEVELS: Level[] = [
  { n: 1, threshold: 5_000, name: 'Starter', short: '$5K' },
  { n: 2, threshold: 10_000, name: 'Builder', short: '$10K' },
  { n: 3, threshold: 25_000, name: 'Foundation', short: '$25K' },
  { n: 4, threshold: 50_000, name: 'Momentum', short: '$50K' },
  { n: 5, threshold: 100_000, name: 'Six figures', short: '$100K' },
  { n: 6, threshold: 250_000, name: 'Compounding', short: '$250K' },
  { n: 7, threshold: 500_000, name: 'Halfway', short: '$500K' },
  { n: 8, threshold: NET_WORTH_TARGET, name: 'Millionaire', short: '$1M' },
];

export interface LevelProgress {
  /** Highest level whose threshold has been reached; 0 before the first. */
  current: number;
  currentLevel: Level | null;
  /** The level being worked toward, or null once the ladder is complete. */
  next: Level | null;
  /** Money still needed to reach `next`. 0 when complete. */
  toGo: number;
  /** How far through the current band, 0-100. */
  pctThroughLevel: number;
  /** Progress toward $1M, 0-100. */
  pctOfTarget: number;
  /** Floor of the current band — the previous threshold, or 0. */
  bandFrom: number;
  /** Ceiling of the current band — the next threshold. */
  bandTo: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** Where a net worth sits on the ladder. Negative net worth reads as level 0. */
export function levelProgress(netWorth: number): LevelProgress {
  const nw = Number.isFinite(netWorth) ? netWorth : 0;

  let current = 0;
  for (const l of LEVELS) {
    if (nw >= l.threshold) current = l.n; else break;
  }

  const currentLevel = current > 0 ? LEVELS[current - 1] : null;
  const next = current < LEVELS.length ? LEVELS[current] : null;

  const bandFrom = currentLevel ? currentLevel.threshold : 0;
  const bandTo = next ? next.threshold : NET_WORTH_TARGET;
  const span = bandTo - bandFrom;

  return {
    current,
    currentLevel,
    next,
    toGo: next ? Math.max(next.threshold - nw, 0) : 0,
    pctThroughLevel: span > 0 ? clamp(((nw - bandFrom) / span) * 100, 0, 100) : 100,
    pctOfTarget: clamp((nw / NET_WORTH_TARGET) * 100, 0, 100),
    bandFrom,
    bandTo,
  };
}

/** Fraction 0-1 of the way along the whole ladder, for positioning the "YOU"
    marker. Spaced by level index rather than by dollars, so the early levels
    are not crushed into the left edge by the $1M scale. */
export function ladderPosition(netWorth: number): number {
  const nw = Number.isFinite(netWorth) ? netWorth : 0;
  if (nw <= 0) return 0;
  const last = LEVELS.length - 1;

  for (let i = 0; i < LEVELS.length; i++) {
    if (nw < LEVELS[i].threshold) {
      const from = i === 0 ? 0 : LEVELS[i - 1].threshold;
      const within = (nw - from) / (LEVELS[i].threshold - from);
      // Node i-1 sits at (i-1)/last; node i at i/last.
      const base = i === 0 ? 0 : (i - 1) / last;
      const stepTo = i / last;
      return clamp(base + within * (stepTo - base), 0, 1);
    }
  }
  return 1;
}

/** "$22.55K", "$1.20M" — compact money for the journey marker. */
export function compactMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
