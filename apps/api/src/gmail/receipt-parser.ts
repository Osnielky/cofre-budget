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

const EXCLUDE_ROW_RE = /(sub\s*-?\s*total|^total$|order\s*total|grand\s*total|total\s*due|amount\s*charged|tax|shipping|discount|gift\s*card|promo)/i;
const PRICE_CELL_RE = /\$\s*([\d,]+\.\d{2})/;
const QTY_CELL_RE = /^\s*(?:qty\s*[:\-]?\s*)?(\d{1,3})\s*$/i;

/** Returns each <table>'s rows as arrays of cell text, for structural line-item scanning. */
export function extractTables(html: string): string[][][] {
  const $ = cheerio.load(html);
  const tables: string[][][] = [];
  $('table').each((_, table) => {
    const rows: string[][] = [];
    $(table)
      .find('tr')
      .each((_, tr) => {
        const cells: string[] = [];
        $(tr)
          .find('td, th')
          .each((_, cell) => {
            cells.push($(cell).text().replace(/\s+/g, ' ').trim());
          });
        if (cells.length) rows.push(cells);
      });
    if (rows.length) tables.push(rows);
  });
  return tables;
}

/** Best-effort: a "line item" row has one price-like cell and one description cell, and isn't a total/tax/shipping row. */
export function extractLineItems(tables: string[][][]): ParsedItem[] {
  const items: ParsedItem[] = [];

  for (const rows of tables) {
    for (const row of rows) {
      if (EXCLUDE_ROW_RE.test(row.join(' '))) continue;

      let priceCellIdx = -1;
      let price = 0;
      for (let i = 0; i < row.length; i++) {
        const m = row[i].match(PRICE_CELL_RE);
        if (m) {
          priceCellIdx = i;
          price = parseFloat(m[1].replace(/,/g, ''));
          break;
        }
      }
      if (priceCellIdx === -1) continue;

      let quantity = 1;
      for (let i = 0; i < row.length; i++) {
        if (i === priceCellIdx) continue;
        const m = row[i].match(QTY_CELL_RE);
        if (m) {
          quantity = parseInt(m[1], 10);
          break;
        }
      }

      const nameCell = row.find((cell, i) => i !== priceCellIdx && cell.length > 3 && !QTY_CELL_RE.test(cell));
      if (!nameCell) continue;

      // The cell price is assumed to be the row's line total (qty x unit price), not the per-unit price.
      items.push({
        name: nameCell.slice(0, 200),
        quantity,
        unitPrice: quantity > 0 ? Math.round((price / quantity) * 100) / 100 : price,
        total: price,
      });
    }
  }

  return items;
}

export interface ReceiptEmailInput {
  html: string;
  subject: string;
  from: string;
  dateHeader: string | null;
}

/** Returns null when no total can be found — caller should treat that as "not a receipt" and skip it. */
export function parseReceiptEmail(input: ReceiptEmailInput): ParsedReceipt | null {
  const text = extractPlainText(input.html);
  const total = extractTotal(text);
  if (total === null) return null;

  const merchant = extractMerchantName(input.from, input.subject);
  let items = extractLineItems(extractTables(input.html));
  if (items.length === 0) {
    items = [{ name: `${merchant} order`, quantity: 1, unitPrice: total, total }];
  }

  return {
    merchant,
    orderNumber: extractOrderNumber(text),
    orderDate: extractOrderDate(text, input.dateHeader),
    currency: 'USD',
    total,
    items,
  };
}
