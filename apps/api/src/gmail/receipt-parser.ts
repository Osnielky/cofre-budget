import * as cheerio from 'cheerio';

export interface ParsedItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ParsedReceipt {
  merchant: string;
  orderNumber: string | null;
  orderDate: string | null;
  currency: string;
  total: number;
  items: ParsedItem[];
}

const TOTAL_LABEL_RE =
  /(grand\s*total|order\s*total|amount\s*charged|total\s*charged|total\s*due|total)\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i;
const EXCLUDE_TOTAL_LINE_RE = /(sub\s*-?\s*total|estimated\s*total)/i;

const ORDER_NUMBER_RE = /(?:order|confirmation)\s*(?:#|no\.?|number)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{3,})/i;
const ORDER_DATE_RE = /order\s*date\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i;

/** Flattens HTML into newline-separated block text, so regexes can scan line-by-line. */
export function extractPlainText(html: string): string {
  const withBreaks = html
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const $ = cheerio.load(withBreaks);
  $('script, style').remove();
  return $.root()
    .text()
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Highest-priority total line wins: "Grand Total"/"Amount Charged" > "Order Total"/"Total Due" > bare "Total". */
export function extractTotal(text: string): number | null {
  let best: number | null = null;
  let bestPriority = -1;
  for (const line of text.split('\n')) {
    if (EXCLUDE_TOTAL_LINE_RE.test(line)) continue;
    const m = line.match(TOTAL_LABEL_RE);
    if (!m) continue;
    const label = m[1].toLowerCase();
    const amount = parseFloat(m[2].replace(/,/g, ''));
    const priority = /grand\s*total|amount\s*charged|total\s*charged/.test(label)
      ? 2
      : /order\s*total|total\s*due/.test(label)
        ? 1
        : 0;
    if (priority > bestPriority) {
      bestPriority = priority;
      best = amount;
    }
  }
  return best;
}

export function extractMerchantName(fromHeader: string, subject: string): string {
  const displayMatch = fromHeader.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  if (displayMatch && displayMatch[1].trim()) {
    return displayMatch[1].trim();
  }
  const emailMatch = fromHeader.match(/([^@\s<]+)@([^\s>]+)/);
  if (emailMatch) {
    const domain = emailMatch[2].split('.')[0];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }
  return subject.slice(0, 60) || 'Unknown Merchant';
}

export function extractOrderNumber(text: string): string | null {
  const m = text.match(ORDER_NUMBER_RE);
  return m ? m[1] : null;
}

function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function extractOrderDate(text: string, emailDateHeader: string | null): string | null {
  const explicit = text.match(ORDER_DATE_RE);
  if (explicit) {
    const parsed = new Date(explicit[1]);
    if (!isNaN(parsed.getTime())) return toLocalDateString(parsed);
  }
  if (emailDateHeader) {
    const parsed = new Date(emailDateHeader);
    if (!isNaN(parsed.getTime())) return toLocalDateString(parsed);
  }
  return null;
}
