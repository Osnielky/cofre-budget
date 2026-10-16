/* Approximate colors of real cards, so a card graphic on /cards resembles the card in
   the user's wallet. Colors only — never logos or card artwork (issuers' trademarks).
   These are content colors describing a physical object, not theme colors, which is
   why they are hex values rather than CSS variables. Unknown cards fall back to the
   issuer's color, then (null) to the theme accent. Add products only when sure of the
   color. */

const ISSUERS: { key: string; aliases: string[]; color: string }[] = [
  { key: 'chase', aliases: ['chase', 'jpmorgan'], color: '#117ACA' },
  { key: 'bofa', aliases: ['bank of america', 'bofa'], color: '#C8102E' },
  { key: 'amex', aliases: ['american express', 'amex'], color: '#016FD0' },
  { key: 'capitalone', aliases: ['capital one', 'capitalone'], color: '#004977' },
  { key: 'citi', aliases: ['citibank', 'citi'], color: '#056DAE' },
  { key: 'discover', aliases: ['discover'], color: '#E55C20' },
  { key: 'wellsfargo', aliases: ['wells fargo'], color: '#D71E28' },
  { key: 'usbank', aliases: ['us bank', 'u s bank'], color: '#0C2074' },
  { key: 'barclays', aliases: ['barclays'], color: '#00AEEF' },
];

/* Products whose color differs from the issuer's, matched within that issuer only. */
const PRODUCTS: { issuer: string; match: string; color: string }[] = [
  { issuer: 'amex', match: 'platinum', color: '#B4B8BD' },
  { issuer: 'amex', match: 'gold', color: '#C9A54A' },
  { issuer: 'amex', match: 'green', color: '#2E7D4F' },
  { issuer: 'chase', match: 'sapphire reserve', color: '#141B2D' },
  { issuer: 'chase', match: 'sapphire preferred', color: '#1D3A8A' },
  { issuer: 'capitalone', match: 'venture x', color: '#22303C' },
  { issuer: 'capitalone', match: 'quicksilver', color: '#A7AFB7' },
];

const words = (s: string) => s.toLowerCase().replace(/[®™©]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function issuerOf(bankName: string): (typeof ISSUERS)[number] | null {
  // Whole-word match: "First Platypus Bank" must not match "us bank".
  const bank = ` ${words(bankName)} `;
  if (!bank.trim()) return null;
  return ISSUERS.find((i) => i.aliases.some((a) => bank.includes(` ${a} `))) ?? null;
}

export function cardColor(bankName: string, cardName: string): string | null {
  const issuer = issuerOf(bankName);
  if (!issuer) return null;
  const name = ` ${words(cardName)} `;
  const product = PRODUCTS.find((p) => p.issuer === issuer.key && name.includes(` ${p.match} `));
  return product?.color ?? issuer.color;
}
