import { PLAN_PRICES, TRIAL_DAYS } from '@/lib/plans';

/* Facts the /compare pages and /mint-alternative render. Competitor prices are
   their public US prices on the day below; the pages print that date beside
   every price and link to the source. Re-check monthly (go-to-market plan,
   phase 2) and bump `pricesCheckedOn`; the test fails once it is 120 days old. */

export const pricesCheckedOn = '2026-10-26';

export interface Competitor {
  slug: string;
  name: string;
  /** Display strings, since one competitor prices with a slider. */
  monthly: string;
  yearly: string;
  /** What the free tier includes, or null when there is none. */
  freePlan: string | null;
  trialDays: number | null;
  platforms: string;
  bankSync: string;
  aiAssistant: string;
  netWorth: string;
  /** Their pricing page. */
  sourceUrl: string;
  /* Page copy */
  headline: string;
  intro: string;
  /** Honest reasons to switch to Cofre. */
  switchReasons: string[];
  /** Honest reasons the other app may suit someone better. */
  stayReasons: string[];
}

const money = (n: number) => `$${n.toFixed(2)}`;

export const COFRE_FACTS = {
  name: 'Cofre',
  monthly: `${money(PLAN_PRICES.pro.month)} (Pro)`,
  yearly: `${money(PLAN_PRICES.pro.year)} (Pro)`,
  freePlan: 'Free forever: manual accounts, CSV import, budgets, recurring charges, debts, projects, net worth',
  trialDays: TRIAL_DAYS,
  platforms: 'Web (works on any phone or desktop browser)',
  bankSync: 'Pro and Elite, through Plaid',
  aiAssistant: 'Ask Cofre (Pro and Elite): answers from your real numbers, proposes changes you confirm',
  netWorth: 'Yes, with milestones on the road to $1M',
};

export const COMPETITORS: Competitor[] = [
  {
    slug: 'monarch-money',
    name: 'Monarch Money',
    monthly: '$14.99',
    yearly: '$99.99',
    freePlan: null,
    trialDays: 7,
    platforms: 'Web, iOS, Android',
    bankSync: 'Yes',
    aiAssistant: 'Yes (AI features in the app)',
    netWorth: 'Yes',
    sourceUrl: 'https://www.monarchmoney.com/pricing',
    headline: 'Cofre vs Monarch Money',
    intro:
      'Monarch became the default home for Mint users and is a polished, full-featured app. It also costs $99.99 a year with no free plan. Cofre keeps the essentials free and prices bank sync and its AI assistant at $4.99 a month.',
    switchReasons: [
      'A free plan that stays free: budgets, manual accounts, CSV import, recurring charges, debts and net worth.',
      `Bank sync and Ask Cofre for ${money(PLAN_PRICES.pro.month)} a month, about a third of Monarch's monthly price.`,
      'An AI assistant that only proposes changes; nothing is categorized or budgeted until you confirm it.',
      'Credit card APRs, limits, due dates and utilization with payment tips built from your own numbers.',
    ],
    stayReasons: [
      'You want native iOS and Android apps today. Cofre is a web app.',
      'You share one household budget with a partner and need shared access.',
      'You rely on Monarch\'s investment holdings view; Cofre tracks investment balances, not individual holdings.',
    ],
  },
  {
    slug: 'ynab',
    name: 'YNAB',
    monthly: '$14.99',
    yearly: '$109',
    freePlan: null,
    trialDays: 34,
    platforms: 'Web, iOS, Android',
    bankSync: 'Yes',
    aiAssistant: 'No assistant you can ask questions',
    netWorth: 'Yes (reports)',
    sourceUrl: 'https://www.ynab.com/pricing',
    headline: 'Cofre vs YNAB',
    intro:
      'YNAB teaches zero-based budgeting and has a devoted following, at $109 a year. If you want the method, YNAB is the method. If you want to see where the money went, catch forgotten subscriptions and watch net worth grow without giving every dollar a job, Cofre is simpler and cheaper.',
    switchReasons: [
      'No method to learn: connect or import, and the dashboard, budgets and recurring charges fill themselves in.',
      'Free forever for manual tracking; bank sync and Ask Cofre on Pro for a fraction of the price.',
      'Ask "where did my money go this month" and get an answer from your transactions.',
      'The road to $1M: milestones, pace and a projected date, built in.',
    ],
    stayReasons: [
      'You want envelope (zero-based) budgeting, where every dollar is assigned before it is spent.',
      'You want YNAB\'s workshops and community around the method.',
      'You need native mobile apps today.',
    ],
  },
  {
    slug: 'copilot-money',
    name: 'Copilot Money',
    monthly: '$13',
    yearly: '$95',
    freePlan: null,
    trialDays: 30,
    platforms: 'iOS, macOS and web; no Android app',
    bankSync: 'Yes',
    aiAssistant: 'AI categorization; no assistant you can ask questions',
    netWorth: 'Yes',
    sourceUrl: 'https://www.copilot.money/pricing',
    headline: 'Cofre vs Copilot Money',
    intro:
      'Copilot is a beautiful, Apple-first money app at $95 a year. Android users and anyone who wants a free plan are left out. Cofre runs in any browser on any device, keeps the basics free, and adds an assistant you can actually ask questions.',
    switchReasons: [
      'Works on Android, Windows and everything else with a browser.',
      'Free plan for manual accounts and CSV import; Pro adds bank sync and the assistant.',
      'Ask Cofre answers questions from your real data and can only propose changes you confirm.',
      'Credit card details, debts, projects and the road to $1M in one place.',
    ],
    stayReasons: [
      'You are all-in on iPhone and Mac and want a native app with widgets.',
      'You want Copilot\'s investment performance views.',
    ],
  },
  {
    slug: 'rocket-money',
    name: 'Rocket Money',
    monthly: '$7 to $14 (you pick the amount)',
    yearly: 'Billed monthly or yearly at the amount you pick',
    freePlan: 'Yes, with limited features',
    trialDays: null,
    platforms: 'Web, iOS, Android',
    bankSync: 'Yes',
    aiAssistant: 'Premium+ adds an assistant at a higher price',
    netWorth: 'Yes',
    sourceUrl: 'https://www.rocketmoney.com/premium',
    headline: 'Cofre vs Rocket Money',
    intro:
      'Rocket Money is known for finding and cancelling subscriptions and for bill negotiation, which takes a share of what it saves you. Premium is a pay-what-you-want slider from about $7 to $14 a month. Cofre is a budget and net-worth tracker first, with a free plan that covers the basics and a fixed $4.99 Pro price.',
    switchReasons: [
      'Fixed, lower price for bank sync, with no negotiation fees or upsells.',
      'Recurring-charge detection is included on every plan, including Free.',
      'Budgets, debts, projects and the road to $1M, not only subscriptions.',
      'Ask Cofre on Pro, instead of a separate higher tier for the assistant.',
    ],
    stayReasons: [
      'You want Rocket Money to negotiate bills or cancel subscriptions for you.',
      'You want a native mobile app today.',
    ],
  },
];

export function competitorBySlug(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}

/** "Oct 26, 2026" for the price-checked note. */
export function pricesCheckedLabel(): string {
  const [y, m, d] = pricesCheckedOn.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
