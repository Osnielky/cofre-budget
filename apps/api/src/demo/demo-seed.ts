/**
 * Demo data generator. Pure and deterministic: the same { year, today } always
 * produces the same graph, so Rockefeller and every visitor sandbox match and
 * the tests can assert exact shapes. Nothing here touches the database —
 * DemoService.populate() writes the result.
 *
 * Money convention follows Transaction.amount: negative = money out.
 * Account `balance` is "as of today": opening balance plus the signed effect of
 * every transaction dated ≤ today (liabilities grow when money goes out).
 */

export interface DemoOptions { year: number; today: string /* YYYY-MM-DD */ }

export interface DemoAccount {
  key: string; bankName: string; accountName: string; accountType: string;
  openingBalance: number; balance: number; color: string; last4: string; liability: boolean;
}
export interface DemoCategory {
  name: string; icon: string; color: string; type: string; isFixed?: boolean; wantNeed?: 'want' | 'need' | null; description?: string;
}
export interface DemoTransaction {
  date: string; name: string; merchantName: string | null; amount: number; accountKey: string;
  category: string | null; transferPairKey?: string; projectKey?: string; projectCategoryName?: string;
  note?: string; recurringRuleName?: string; debtKey?: string;
}
export interface DemoBudget { month: string; category: string; amount: number; rollover?: boolean; notifyEnabled?: boolean; isRecurring?: boolean }
export interface DemoRecurringRule {
  name: string; amount: number; category: string; accountKey: string; dayOfMonth: number; startDate: string;
  lastRunDate: string | null; runCount: number;
}
export interface DemoCategorizationRule { matchType: 'merchant' | 'name'; matchValue: string; matchStrategy: 'exact' | 'prefix'; category: string }
export interface DemoDebt {
  key: string; borrowerName: string; principal: number; description: string; startDate: string; dueDate: string | null;
  direction: 'lent' | 'owed'; payments: { amount: number; date: string; note?: string }[];
}
export interface DemoProject {
  key: string; name: string; type: string; icon: string; color: string; description: string;
  purchasePrice: number; purchaseDate: string; status: 'active' | 'sold'; salePrice: number | null; saleDate: string | null;
  categories: { name: string; icon: string; color: string; type: 'expense' | 'income' }[];
}
export interface DemoCardDetail {
  accountKey: string; creditLimit: number; officialName: string; purchaseApr: number; lastStatementBalance: number;
  lastStatementDate: string; minimumPayment: number; nextPaymentDueDate: string; lastPaymentAmount: number; lastPaymentDate: string;
}
export interface DemoData {
  accounts: DemoAccount[];
  categories: DemoCategory[];
  transactions: DemoTransaction[];
  budgets: DemoBudget[];
  recurringRules: DemoRecurringRule[];
  categorizationRules: DemoCategorizationRule[];
  debts: DemoDebt[];
  projects: DemoProject[];
  cardDetails: DemoCardDetail[];
  cardProfile: { goal: 'pay_off_debt' | 'cashback' | 'travel' | 'build_credit'; annualFeeOk: boolean; creditScoreBand: '740-799'; monthlyDebtBudget: number };
  netWorthSnapshots: { date: string; value: number }[];
  goalTargetDate: string;
  conversation: { title: string; messages: { role: 'user' | 'assistant'; text: string }[] };
}

/* ── Deterministic PRNG (mulberry32) ── */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
const round2 = (n: number) => Math.round(n * 100) / 100;

export function generateDemoData({ year, today }: DemoOptions): DemoData {
  const rand = prng(year * 7919 + 20261020);
  const between = (lo: number, hi: number) => round2(lo + rand() * (hi - lo));
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const day = (m: number, lo: number, hi: number) => ymd(year, m, Math.min(daysIn(year, m), int(lo, hi)));

  /* ── Accounts ── */
  const accounts: DemoAccount[] = [
    { key: 'checking', bankName: 'Chase', accountName: 'Total Checking', accountType: 'checking', openingBalance: 4120.55, balance: 0, color: '#117ACA', last4: '4821', liability: false },
    { key: 'savings', bankName: 'Ally Bank', accountName: 'High-Yield Savings', accountType: 'savings', openingBalance: 18400, balance: 0, color: '#4FBF7F', last4: '0093', liability: false },
    { key: 'amex', bankName: 'American Express', accountName: 'Blue Cash Everyday', accountType: 'credit', openingBalance: 612.4, balance: 0, color: '#2E77BB', last4: '1007', liability: true },
    { key: 'sapphire', bankName: 'Chase', accountName: 'Sapphire Preferred', accountType: 'credit', openingBalance: 1180.2, balance: 0, color: '#1C3F6E', last4: '7731', liability: true },
    { key: 'brokerage', bankName: 'Fidelity', accountName: 'Brokerage', accountType: 'investment', openingBalance: 31250, balance: 0, color: '#4BA8D8', last4: '5560', liability: false },
    { key: 'carloan', bankName: 'Toyota Financial', accountName: 'RAV4 loan', accountType: 'other_liability', openingBalance: 14890, balance: 0, color: '#F5C842', last4: '2210', liability: true },
  ];

  /* ── Categories: the app's defaults plus a few personal ones ── */
  const categories: DemoCategory[] = [
    { name: 'Food & Dining', icon: '🍔', color: '#F07A3E', type: 'expense', wantNeed: 'want', description: 'Restaurants, coffee & snacks' },
    { name: 'Groceries', icon: '🛒', color: '#4FBF7F', type: 'expense', wantNeed: 'need', description: 'Supermarket & grocery store purchases' },
    { name: 'Coffee', icon: '☕', color: '#C08457', type: 'expense', wantNeed: 'want' },
    { name: 'Candy & Sweets', icon: '🍬', color: '#F07A3E', type: 'expense', wantNeed: 'want' },
    { name: 'Transport', icon: '🚗', color: '#4BA8D8', type: 'expense', wantNeed: 'need', description: 'Gas, rideshare, parking & transit' },
    { name: 'Shopping', icon: '🛍️', color: '#9B6DFF', type: 'expense', wantNeed: 'want' },
    { name: 'Clothes', icon: '👗', color: '#E879A0', type: 'expense', wantNeed: 'want' },
    { name: 'House Rent', icon: '🏡', color: '#F5C842', type: 'expense', isFixed: true, wantNeed: 'need' },
    { name: 'Housing', icon: '🏠', color: '#F5C842', type: 'expense', wantNeed: 'need', description: 'Home supplies & repairs' },
    { name: 'Health', icon: '💊', color: '#4FBF7F', type: 'expense', wantNeed: 'need' },
    { name: 'Gym', icon: '🏋️', color: '#4FBF7F', type: 'expense', isFixed: true, wantNeed: 'want' },
    { name: 'Entertainment', icon: '🎬', color: '#E879A0', type: 'expense', wantNeed: 'want' },
    { name: 'Utilities', icon: '💡', color: '#F5C842', type: 'expense', isFixed: true, wantNeed: 'need' },
    { name: 'Phone', icon: '📞', color: '#4BA8D8', type: 'expense', isFixed: true, wantNeed: 'need' },
    { name: 'Car Insurance', icon: '🛡️', color: '#4BA8D8', type: 'expense', isFixed: true, wantNeed: 'need' },
    { name: 'Travel', icon: '✈️', color: '#4BA8D8', type: 'expense', wantNeed: 'want' },
    { name: 'Subscriptions', icon: '📱', color: '#9B6DFF', type: 'expense', isFixed: true, wantNeed: 'want' },
    { name: 'Pets', icon: '🐶', color: '#F07A3E', type: 'expense', wantNeed: 'need' },
    { name: 'Kids activities', icon: '🧒', color: '#9B6DFF', type: 'expense', wantNeed: 'want' },
    { name: 'Education', icon: '🎓', color: '#4FBF7F', type: 'expense', wantNeed: 'need' },
    { name: 'Salary', icon: '💼', color: '#4FBF7F', type: 'income' },
    { name: 'Freelance', icon: '💻', color: '#9B6DFF', type: 'income' },
    { name: 'Reimbursement', icon: '🤝', color: '#4FBF7F', type: 'income' },
    { name: 'Cash-reward', icon: '🎁', color: '#F5C842', type: 'income' },
    { name: 'Investments', icon: '📈', color: '#F5C842', type: 'savings', description: 'Money you invest or save' },
    { name: 'Other', icon: '📦', color: '#5C5C78', type: 'both' },
    { name: 'Credit Card Payment', icon: '💳', color: '#6B6B8A', type: 'transfer' },
    { name: 'Internal Transfer', icon: '🔄', color: '#6B6B8A', type: 'transfer' },
  ];

  /* ── Projects ── */
  const projects: DemoProject[] = [
    {
      key: 'civic', name: '2016 Honda Civic flip', type: 'vehicle', icon: '🚗', color: '#F07A3E',
      description: 'Bought at auction, fixed up, resold.', purchasePrice: 6500, purchaseDate: ymd(year, 1, 20),
      status: 'sold', salePrice: 9200, saleDate: ymd(year, 6, 14),
      categories: [
        { name: 'Mechanic', icon: '🔧', color: '#F07A3E', type: 'expense' },
        { name: 'Tires', icon: '🛞', color: '#F5C842', type: 'expense' },
        { name: 'Maintenance', icon: '🔩', color: '#9B6DFF', type: 'expense' },
        { name: 'Sale', icon: '💵', color: '#4FBF7F', type: 'income' },
      ],
    },
    {
      key: 'etsy', name: 'Etsy print shop', type: 'business', icon: '🖨️', color: '#9B6DFF',
      description: 'Side business selling art prints.', purchasePrice: 900, purchaseDate: ymd(year, 2, 3),
      status: 'active', salePrice: null, saleDate: null,
      categories: [
        { name: 'Supplies', icon: '📦', color: '#F07A3E', type: 'expense' },
        { name: 'Fees', icon: '🧾', color: '#F5C842', type: 'expense' },
        { name: 'Sales', icon: '💰', color: '#4FBF7F', type: 'income' },
      ],
    },
  ];

  /* ── Debts ── */
  const debts: DemoDebt[] = [
    { key: 'maria', borrowerName: 'Maria Lopez', principal: 500, description: 'Concert tickets', startDate: ymd(year, 2, 9), dueDate: ymd(year, 11, 30), direction: 'lent',
      payments: [{ amount: 200, date: ymd(year, 4, 2), note: 'Venmo' }, { amount: 150, date: ymd(year, 6, 21) }] },
    { key: 'tom', borrowerName: 'Tom Baker', principal: 1200, description: 'Moving deposit', startDate: ymd(year, 5, 18), dueDate: ymd(year, 12, 15), direction: 'lent', payments: [] },
    { key: 'carlos', borrowerName: 'Carlos Rivera', principal: 800, description: 'Laptop', startDate: ymd(year, 3, 11), dueDate: ymd(year, 10, 31), direction: 'owed',
      payments: [{ amount: 300, date: ymd(year, 8, 5) }] },
  ];

  /* ── Transactions ── */
  const tx: DemoTransaction[] = [];
  const add = (t: DemoTransaction) => { tx.push({ ...t, amount: round2(t.amount) }); };
  let pairN = 0;
  const transfer = (date: string, from: string, to: string, amount: number, name: string, category: string, toCategory = category, fromExtra: Partial<DemoTransaction> = {}) => {
    const key = `pair-${++pairN}`;
    add({ date, name, merchantName: null, amount: -amount, accountKey: from, category, transferPairKey: key, ...fromExtra });
    add({ date, name, merchantName: null, amount, accountKey: to, category: toCategory, transferPairKey: key });
  };

  const groceryStores = ['Whole Foods', 'Trader Joe’s', 'Costco', 'Key Food', 'H Mart'];
  const dining = ['Chipotle', 'Sushi Nakazawa', 'Olive Garden', 'Shake Shack', 'Joe’s Pizza', 'Sweetgreen', 'Panera Bread', 'Xi’an Famous Foods', 'The Smith', 'Dig Inn'];
  const coffee = ['Blue Bottle Coffee', 'Starbucks', 'Café Grumpy', 'Dunkin’'];
  const shopping = ['Amazon', 'Target', 'Best Buy', 'IKEA', 'Home Depot'];
  const clothes = ['Uniqlo', 'Zara', 'Nike', 'Everlane'];
  const entertainment = ['AMC Theatres', 'Steam', 'Ticketmaster', 'Bowlero', 'Nintendo eShop'];
  const uncatMerchants = ['SQ *HAPPY GARDEN', 'TST* LUNA ROOFTOP', 'PAYPAL *MARKETPLACE', 'ZELLE PAYMENT', 'APPLE.COM/BILL', 'CHECKCARD 4821 NYC TAXI', 'AMZN Mktp US*2K4', 'PY *BROOKLYN FLEA'];
  const travel: Record<number, { name: string; amount: number; account: string }[]> = {
    3: [{ name: 'Delta Air Lines', amount: 540, account: 'sapphire' }, { name: 'Marriott Cancún', amount: 890, account: 'sapphire' }],
    7: [{ name: 'Airbnb Lisbon', amount: 1200, account: 'sapphire' }, { name: 'TAP Air Portugal', amount: 410, account: 'sapphire' }, { name: 'Uber Lisbon', amount: 62, account: 'sapphire' }],
    11: [{ name: 'Amtrak', amount: 186, account: 'sapphire' }, { name: 'Hyatt Place Boston', amount: 434, account: 'sapphire' }],
  };

  const cardSpendByMonth: Record<string, number[]> = { amex: Array(13).fill(0), sapphire: Array(13).fill(0) };
  const spend = (date: string, name: string, amount: number, accountKey: string, category: string | null, extra: Partial<DemoTransaction> = {}) => {
    add({ date, name, merchantName: name.toUpperCase(), amount: -amount, accountKey, category, ...extra });
    if (cardSpendByMonth[accountKey]) cardSpendByMonth[accountKey][Number(date.slice(5, 7))] += amount;
  };

  for (let m = 1; m <= 12; m++) {
    const last = daysIn(year, m);
    // Income
    add({ date: ymd(year, m, 1), name: 'ACME Corp payroll', merchantName: 'ACME CORP', amount: 3250, accountKey: 'checking', category: 'Salary' });
    add({ date: ymd(year, m, 15), name: 'ACME Corp payroll', merchantName: 'ACME CORP', amount: 3250, accountKey: 'checking', category: 'Salary' });
    if (rand() < 0.7) add({ date: day(m, 6, 24), name: 'Upwork payout', merchantName: 'UPWORK', amount: between(420, 1400), accountKey: 'checking', category: 'Freelance' });
    if (m === 4) add({ date: ymd(year, 4, 17), name: 'IRS tax refund', merchantName: 'IRS TREAS 310', amount: 1840, accountKey: 'checking', category: 'Reimbursement' });
    if (m % 3 === 0) add({ date: day(m, 2, 6), name: 'Amex cash back', merchantName: 'AMERICAN EXPRESS', amount: between(18, 42), accountKey: 'amex', category: 'Cash-reward' });

    // Fixed bills
    spend(ymd(year, m, 1), 'Parkside Apartments', 2100, 'checking', 'House Rent', { recurringRuleName: 'Rent' });
    spend(day(m, 3, 6), 'ConEdison', between(88, 164), 'checking', 'Utilities');
    spend(ymd(year, m, 8), 'Verizon Fios', 79.99, 'checking', 'Utilities');
    spend(ymd(year, m, 12), 'T-Mobile', 65, 'checking', 'Phone');
    spend(ymd(year, m, 20), 'GEICO', 142.5, 'checking', 'Car Insurance');
    spend(ymd(year, m, 7), 'Netflix', 15.49, 'amex', 'Subscriptions', { recurringRuleName: 'Netflix' });
    spend(ymd(year, m, 14), 'Spotify', 11.99, 'amex', 'Subscriptions', { recurringRuleName: 'Spotify' });
    spend(ymd(year, m, 3), 'Apple iCloud', 2.99, 'amex', 'Subscriptions');
    spend(ymd(year, m, 1), 'Equinox', 185, 'amex', 'Gym', { recurringRuleName: 'Equinox gym' });
    spend(day(m, 9, 12), 'Chewy', between(44, 72), 'amex', 'Pets');
    spend(day(m, 4, 8), 'Brooklyn Kids Soccer', 120, 'checking', 'Kids activities');
    transfer(ymd(year, m, 10), 'checking', 'carloan', 389, 'Toyota Financial autopay', 'Internal Transfer', 'Internal Transfer', { recurringRuleName: 'Toyota Financial autopay' });

    // Variable spending
    for (let i = 0; i < int(4, 6); i++) spend(day(m, 1, last), pick(groceryStores), between(48, 185), 'amex', 'Groceries');
    for (let i = 0; i < int(9, 13); i++) spend(day(m, 1, last), pick(dining), between(11, 86), 'sapphire', 'Food & Dining');
    for (let i = 0; i < int(8, 12); i++) spend(day(m, 1, last), pick(coffee), between(4.25, 7.75), 'amex', 'Coffee');
    for (let i = 0; i < int(1, 3); i++) spend(day(m, 1, last), 'Duane Reade', between(3.5, 12), 'amex', 'Candy & Sweets');
    spend(day(m, 1, 5), 'MTA MetroCard', 33, 'checking', 'Transport');
    spend(day(m, 15, 19), 'MTA MetroCard', 33, 'checking', 'Transport');
    for (let i = 0; i < int(2, 4); i++) spend(day(m, 1, last), 'Uber', between(13, 38), 'sapphire', 'Transport');
    for (let i = 0; i < 2; i++) spend(day(m, 1, last), 'Shell', between(42, 68), 'amex', 'Transport');
    for (let i = 0; i < int(1, 2); i++) spend(day(m, 1, last), 'Icon Parking', between(18, 45), 'sapphire', 'Transport');
    for (let i = 0; i < int(2, 4); i++) spend(day(m, 1, last), pick(shopping), between(18, 140), 'sapphire', 'Shopping');
    if (rand() < 0.8) spend(day(m, 1, last), pick(clothes), between(38, 160), 'sapphire', 'Clothes');
    for (let i = 0; i < int(1, 3); i++) spend(day(m, 1, last), pick(entertainment), between(14, 95), 'sapphire', 'Entertainment');
    for (let i = 0; i < int(1, 2); i++) spend(day(m, 1, last), 'CVS Pharmacy', between(9, 48), 'amex', 'Health');
    if (rand() < 0.3) spend(day(m, 1, last), 'One Medical copay', 35, 'amex', 'Health');
    if (rand() < 0.4) spend(day(m, 1, last), 'Home Depot', between(22, 130), 'amex', 'Housing');
    if (m === 9) spend(ymd(year, 9, 2), 'Coursera', 49, 'amex', 'Education');
    for (const t of travel[m] ?? []) spend(day(m, 8, 22), t.name, t.amount, t.account, 'Travel');
    if (rand() < 0.25) add({ date: day(m, 1, last), name: 'Amazon refund', merchantName: 'AMAZON', amount: between(19, 90), accountKey: 'sapphire', category: 'Shopping' });
    for (let i = 0; i < int(1, 3); i++) spend(day(m, 1, last), pick(uncatMerchants), between(8, 74), pick(['amex', 'sapphire', 'checking']), null);

    // Savings + investing
    transfer(ymd(year, m, 2), 'checking', 'savings', 600, 'Transfer to savings', 'Internal Transfer');
    transfer(ymd(year, m, 16), 'checking', 'brokerage', 400, 'Fidelity contribution', 'Investments', 'Internal Transfer');
    if (m % 4 === 0) add({ date: ymd(year, m, 28), name: 'Market gain', merchantName: null, amount: between(380, 1150), accountKey: 'brokerage', category: 'Investments', note: 'Quarterly statement adjustment' });
    add({ date: ymd(year, m, last), name: 'Interest paid', merchantName: 'ALLY BANK', amount: between(55, 70), accountKey: 'savings', category: 'Cash-reward' });

    // Card payments on the 25th: previous month's statement
    if (m > 1) {
      for (const card of ['amex', 'sapphire'] as const) {
        const owed = round2(cardSpendByMonth[card][m - 1]);
        if (owed > 0) transfer(ymd(year, m, 25), 'checking', card, owed, `${card === 'amex' ? 'Amex' : 'Chase Sapphire'} payment`, 'Credit Card Payment');
      }
    }

    // Projects
    if (m >= 2 && m <= 6) {
      const civicCost = [['Mechanic', 'Vinny’s Auto Repair', 640], ['Tires', 'Discount Tire', 480], ['Maintenance', 'AutoZone', 96], ['Maintenance', 'Detail King', 180], ['Mechanic', 'Vinny’s Auto Repair', 310]][m - 2] as [string, string, number];
      spend(day(m, 3, 20), civicCost[1], civicCost[2], 'savings', null, { projectKey: 'civic', projectCategoryName: civicCost[0] });
    }
    if (m >= 2) {
      for (let i = 0; i < int(1, 2); i++) add({ date: day(m, 2, last), name: 'Etsy payout', merchantName: 'ETSY', amount: between(140, 620), accountKey: 'checking', category: null, projectKey: 'etsy', projectCategoryName: 'Sales' });
      spend(day(m, 1, last), 'Blick Art Materials', between(35, 140), 'amex', null, { projectKey: 'etsy', projectCategoryName: 'Supplies' });
      spend(ymd(year, m, last), 'Etsy fees', between(12, 48), 'checking', null, { projectKey: 'etsy', projectCategoryName: 'Fees' });
    }
  }
  // Project purchases and sale
  spend(ymd(year, 1, 20), 'Manheim auction', 6500, 'savings', null, { projectKey: 'civic', note: 'Purchase' });
  add({ date: ymd(year, 6, 14), name: 'Civic sale (private buyer)', merchantName: null, amount: 9200, accountKey: 'checking', category: null, projectKey: 'civic', projectCategoryName: 'Sale' });
  spend(ymd(year, 2, 3), 'Epson EcoTank printer', 900, 'amex', null, { projectKey: 'etsy', note: 'Purchase' });

  // Debt money movements (the debt records themselves are seeded separately)
  spend(ymd(year, 2, 9), 'Zelle to Maria Lopez', 500, 'checking', null, { debtKey: 'maria' });
  add({ date: ymd(year, 4, 2), name: 'Zelle from Maria Lopez', merchantName: null, amount: 200, accountKey: 'checking', category: null, debtKey: 'maria' });
  add({ date: ymd(year, 6, 21), name: 'Venmo from Maria Lopez', merchantName: null, amount: 150, accountKey: 'checking', category: null, debtKey: 'maria' });
  spend(ymd(year, 5, 18), 'Zelle to Tom Baker', 1200, 'savings', null, { debtKey: 'tom' });
  add({ date: ymd(year, 3, 11), name: 'Zelle from Carlos Rivera', merchantName: null, amount: 800, accountKey: 'checking', category: null, debtKey: 'carlos' });
  spend(ymd(year, 8, 5), 'Zelle to Carlos Rivera', 300, 'checking', null, { debtKey: 'carlos' });

  tx.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  /* ── Balances as of today ── */
  for (const a of accounts) {
    const effect = tx.filter((t) => t.accountKey === a.key && t.date <= today).reduce((s, t) => s + t.amount, 0);
    a.balance = round2(a.liability ? a.openingBalance - effect : a.openingBalance + effect);
  }

  /* ── Budgets (every month, same plan, carried forward) ── */
  const plan: [string, number][] = [
    ['House Rent', 2100], ['Groceries', 650], ['Food & Dining', 480], ['Coffee', 60], ['Transport', 240], ['Subscriptions', 35],
    ['Gym', 185], ['Shopping', 320], ['Clothes', 120], ['Entertainment', 130], ['Utilities', 330], ['Phone', 65], ['Car Insurance', 145],
    ['Health', 90], ['Pets', 70], ['Kids activities', 120], ['Travel', 250],
  ];
  const budgets: DemoBudget[] = [];
  for (let m = 1; m <= 12; m++) {
    for (const [category, amount] of plan) {
      budgets.push({ month: `${year}-${pad(m)}`, category, amount, isRecurring: true, rollover: category === 'Travel', notifyEnabled: ['Food & Dining', 'Shopping'].includes(category) });
    }
    budgets.push({ month: `${year}-${pad(m)}`, category: 'Salary', amount: 6500, isRecurring: true });
  }

  /* ── Recurring rules, already materialised for the year ── */
  const recurringRules: DemoRecurringRule[] = [
    { name: 'Rent', amount: -2100, category: 'House Rent', accountKey: 'checking', dayOfMonth: 1, startDate: ymd(year, 1, 1), lastRunDate: ymd(year, 12, 1), runCount: 12 },
    { name: 'Netflix', amount: -15.49, category: 'Subscriptions', accountKey: 'amex', dayOfMonth: 7, startDate: ymd(year, 1, 7), lastRunDate: ymd(year, 12, 7), runCount: 12 },
    { name: 'Spotify', amount: -11.99, category: 'Subscriptions', accountKey: 'amex', dayOfMonth: 14, startDate: ymd(year, 1, 14), lastRunDate: ymd(year, 12, 14), runCount: 12 },
    { name: 'Equinox gym', amount: -185, category: 'Gym', accountKey: 'amex', dayOfMonth: 1, startDate: ymd(year, 1, 1), lastRunDate: ymd(year, 12, 1), runCount: 12 },
    { name: 'Toyota Financial autopay', amount: -389, category: 'Internal Transfer', accountKey: 'checking', dayOfMonth: 10, startDate: ymd(year, 1, 10), lastRunDate: ymd(year, 12, 10), runCount: 12 },
  ];

  const categorizationRules: DemoCategorizationRule[] = [
    { matchType: 'merchant', matchValue: 'WHOLE FOODS', matchStrategy: 'exact', category: 'Groceries' },
    { matchType: 'merchant', matchValue: 'TRADER JOE’S', matchStrategy: 'exact', category: 'Groceries' },
    { matchType: 'merchant', matchValue: 'UBER', matchStrategy: 'prefix', category: 'Transport' },
    { matchType: 'merchant', matchValue: 'STARBUCKS', matchStrategy: 'exact', category: 'Coffee' },
    { matchType: 'merchant', matchValue: 'ACME CORP', matchStrategy: 'prefix', category: 'Salary' },
    { matchType: 'name', matchValue: 'Netflix', matchStrategy: 'exact', category: 'Subscriptions' },
  ];

  /* ── Credit card details ── */
  const todayM = Number(today.slice(5, 7));
  const stmtMonth = Math.max(1, todayM - 1);
  const dueM = todayM + 1 > 12 ? 12 : todayM + 1;
  const cardDetails: DemoCardDetail[] = [
    { accountKey: 'amex', creditLimit: 8000, officialName: 'Blue Cash Everyday® Card', purchaseApr: 24.99,
      lastStatementBalance: round2(cardSpendByMonth.amex[stmtMonth]), lastStatementDate: ymd(year, stmtMonth, daysIn(year, stmtMonth)),
      minimumPayment: 35, nextPaymentDueDate: ymd(year, dueM, 25), lastPaymentAmount: round2(cardSpendByMonth.amex[Math.max(1, stmtMonth - 1)]), lastPaymentDate: ymd(year, todayM, 25 <= Number(today.slice(8, 10)) ? 25 : 1) },
    { accountKey: 'sapphire', creditLimit: 12000, officialName: 'Chase Sapphire Preferred®', purchaseApr: 27.24,
      lastStatementBalance: round2(cardSpendByMonth.sapphire[stmtMonth]), lastStatementDate: ymd(year, stmtMonth, daysIn(year, stmtMonth)),
      minimumPayment: 40, nextPaymentDueDate: ymd(year, dueM, 25), lastPaymentAmount: round2(cardSpendByMonth.sapphire[Math.max(1, stmtMonth - 1)]), lastPaymentDate: ymd(year, todayM, 25 <= Number(today.slice(8, 10)) ? 25 : 1) },
  ];

  /* ── Net worth snapshots on the 1st of each month up to today ── */
  const netWorthSnapshots: { date: string; value: number }[] = [];
  for (let m = 1; m <= todayM; m++) {
    const at = ymd(year, m, 1);
    let value = 0;
    for (const a of accounts) {
      const effect = tx.filter((t) => t.accountKey === a.key && t.date < at).reduce((s, t) => s + t.amount, 0);
      const bal = a.liability ? a.openingBalance - effect : a.openingBalance + effect;
      value += a.liability ? -bal : bal;
    }
    netWorthSnapshots.push({ date: at, value: round2(value) });
  }

  return {
    accounts, categories, transactions: tx, budgets, recurringRules, categorizationRules, debts, projects, cardDetails,
    cardProfile: { goal: 'travel', annualFeeOk: true, creditScoreBand: '740-799', monthlyDebtBudget: 900 },
    netWorthSnapshots,
    goalTargetDate: `${year + 15}-01-01`,
    conversation: {
      title: 'Dining this month',
      messages: [
        { role: 'user', text: 'How much did I spend on dining this month?' },
        { role: 'assistant', text: 'So far this month you’ve spent **$412.60** on Food & Dining across 9 purchases, about 38% more than the same point last month. Most of it is weekday lunches near the office. Want me to propose a $400 dining budget for next month?' },
        { role: 'user', text: 'Not yet. Where am I overspending overall?' },
        { role: 'assistant', text: 'Two categories are ahead of pace: **Food & Dining** (86% of budget with 11 days left) and **Shopping** (74%). Everything else is on track, and you’re on pace to save about $1,480 this month.' },
      ],
    },
  };
}
