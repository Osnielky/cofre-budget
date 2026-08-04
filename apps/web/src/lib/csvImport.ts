/* ── CSV Import Library ─────────────────────────────────────────────
   Shared parser and bank-detection helpers.
   Consumed by CsvImportModal and future import flows.
─────────────────────────────────────────────────────────────────── */

export interface CsvRow { date: string; referenceNumber?: string; name: string; amount: number; }

export type CsvType = 'bank' | 'credit' | 'investment' | 'unknown';

export interface CsvFingerprint { bank: string | null; type: CsvType; }

/* ── Bank fingerprints (module-private) ─────────────────────────── */

interface BankFingerprint {
  bank: string;       // normalized bank name for matching
  type: 'bank' | 'credit' | 'investment';
  headerIncludes: string[];   // ALL must be present in header row
  headerExcludes?: string[];  // NONE must be present
}

const BANK_FINGERPRINTS: BankFingerprint[] = [
  // Chase Checking: Details, Posting Date, Type (with values like PARTNERFI_TO_CHASE)
  { bank: 'chase', type: 'bank',   headerIncludes: ['details', 'posting date', 'check or slip'] },
  // Chase Credit: Card, Transaction Date, Category, Memo
  { bank: 'chase', type: 'credit', headerIncludes: ['card', 'transaction date', 'post date', 'category', 'memo'] },
  // Bank of America Checking: Date, Description, Amount, Running Bal.
  { bank: 'bank of america', type: 'bank',   headerIncludes: ['running bal'] },
  // Bank of America Credit: Posted Date, Reference Number, Payee, Address
  { bank: 'bank of america', type: 'credit', headerIncludes: ['posted date', 'reference number', 'payee', 'address'] },
  // Wells Fargo: Date, Amount, Balance, Description (no "type" col)
  { bank: 'wells fargo', type: 'bank',   headerIncludes: ['date', 'amount', 'balance', 'description'], headerExcludes: ['details', 'running bal', 'reference number'] },
  // Citibank credit: Status, Date, Description, Debit, Credit
  { bank: 'citi',        type: 'credit', headerIncludes: ['status', 'debit', 'credit', 'description'], headerExcludes: ['balance'] },
  // Capital One: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit
  { bank: 'capital one', type: 'credit', headerIncludes: ['transaction date', 'posted date', 'card no'] },
  // Charles Schwab brokerage: Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount
  { bank: 'schwab', type: 'investment', headerIncludes: ['action', 'symbol', 'quantity', 'fees & comm'] },
];

const DATE_COL_HINTS = ['date','posting date','transaction date','trans date','post date','activity date','value date'];

export function detectCsvFingerprint(rawText: string): CsvFingerprint {
  // Find the real header row (some banks like BofA prepend a summary block)
  const allLines = rawText.split('\n').map(l => l.trim().replace(/\r/g, ''));
  let headerLine = allLines[0].toLowerCase();
  for (let i = 0; i < Math.min(allLines.length, 15); i++) {
    const lower = allLines[i].toLowerCase();
    if (DATE_COL_HINTS.some(d => lower.split(',').some(col => col.trim() === d))) {
      headerLine = lower;
      break;
    }
  }
  const context = allLines.slice(0, 15).join('\n').toLowerCase();

  for (const fp of BANK_FINGERPRINTS) {
    const allPresent = fp.headerIncludes.every(h => headerLine.includes(h));
    const noneExcluded = !fp.headerExcludes?.some(h => headerLine.includes(h));
    if (allPresent && noneExcluded) return { bank: fp.bank, type: fp.type };
  }

  // Fallback type-only detection (no bank identified)
  if (context.includes('running bal') || context.includes('partnerfi_to_chase') || context.includes('fee_transaction')) {
    return { bank: null, type: 'bank' };
  }
  if (headerLine.includes('reference number') || headerLine.includes('ref no')) {
    return { bank: null, type: 'credit' };
  }
  if (headerLine.includes('symbol') && headerLine.includes('quantity')) {
    return { bank: null, type: 'investment' };
  }
  return { bank: null, type: 'unknown' };
}

export function bankNamesMatch(csvBank: string, accountBank: string): boolean {
  const csv = csvBank.toLowerCase();
  const acc = accountBank.toLowerCase();
  // Allow partial matches: "chase" matches "Chase Bank", "JPMorgan Chase", etc.
  return acc.includes(csv) || csv.includes(acc) ||
    (csv === 'bank of america' && (acc.includes('bofa') || acc.includes('boa'))) ||
    (csv === 'citi' && acc.includes('citibank'));
}

/* Last 4 of the account/card number. Filename first (e.g. "Chase1234.csv"),
   then an explicit "ending in 1234" mention in the file body. Years (1900-2099)
   are excluded so a date like 2026 is never mistaken for a card number. */
export function extractFileLast4(fileName: string, rawText = ''): string | null {
  const baseName = fileName.replace(/\.(?:csv|txt)$/i, '');
  const fromName = [...baseName.matchAll(/(?<!\d)(\d{4})(?!\d)/g)]
    .map((m) => m[1])
    .filter((n) => { const v = parseInt(n, 10); return v < 1900 || v > 2099; })
    .at(-1) ?? null;
  if (fromName) return fromName;

  const m = rawText.match(/ending\s+in\s+(\d{4})\b/i)
    ?? rawText.match(/(?:account|acct|card)\D{0,12}(\d{4})\b/i);
  return m ? m[1] : null;
}

/* ── Parser ─────────────────────────────────────────────────────── */

const DATE_COL_NAMES = ['transaction date','trans date','trans. date','activity date','date','posting date','posted date','post date','value date','booking date'];

export function parseCsv(text: string): { rows: CsvRow[]; finalBalance: number | undefined } {
  const allLines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (allLines.length < 2) throw new Error('CSV file is empty or has no data rows.');

  /* Find the real header row — some banks (BofA) prepend a summary block */
  let headerIdx = 0;
  for (let i = 0; i < Math.min(allLines.length, 15); i++) {
    const cols = parseRow(allLines[i]).map((h) => h.toLowerCase().trim());
    if (cols.some((c) => DATE_COL_NAMES.includes(c))) { headerIdx = i; break; }
  }
  const lines = allLines.slice(headerIdx);
  if (lines.length < 2) throw new Error('No transactions found in this file.');

  const rawHeaders = parseRow(lines[0]);
  // Strip trailing dots so "Running Bal." matches "running bal" (internal dots
  // like "trans. date" are preserved).
  const headers    = rawHeaders.map((h) => h.toLowerCase().trim().replace(/\.+$/, ''));

  const col = (names: string[]) =>
    names.map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1;

  const dateIdx = col(DATE_COL_NAMES);
  const descIdx = col(['description','payee','memo','narrative','details','merchant','name','transaction details','particulars']);
  const amountIdx = col(['amount','transaction amount','net amount','trans amount']);
  const debitIdx  = col(['debit','debit amount','withdrawal','withdrawals','dr','debit(dr)','money out']);
  const creditIdx = col(['credit','credit amount','deposit','deposits','cr','credit(cr)','money in']);
  const splitMode = amountIdx < 0 && debitIdx >= 0 && creditIdx >= 0;
  const refIdx = col(['reference number','reference no','reference','ref no','check no','check number','transaction id']);
  const typeIdx = col(['type','transaction type','trans type']);
  // Brokerage-style exports (Schwab, etc.) carry an Action + Symbol instead of a
  // self-explanatory description ("APPLE INC" alone doesn't say buy vs. sell).
  // Only present on investment CSVs — -1 everywhere else, so other banks are unaffected.
  const actionIdx = col(['action']);
  const symbolIdx = col(['symbol']);

  if (dateIdx < 0) throw new Error('Could not find a Date column. Please share your CSV format so we can add support for it.');
  if (descIdx < 0) throw new Error('Could not find a Description/Payee column.');
  if (amountIdx < 0 && !splitMode) throw new Error('Could not find an Amount column.');

  const SKIP_TYPES = new Set<string>(); // nothing skipped by type — let the user see all transactions
  const SKIP_DESC  = /^(beginning balance|ending balance|opening balance|closing balance)/i;
  const balIdx     = col(['balance','running bal','running balance','available balance','ledger balance','current balance']);

  const rows: CsvRow[] = [];
  // Running-balance per row (incl. beginning/ending-balance marker rows), in file
  // order, so we can pick the chronologically-latest one regardless of sort order.
  const balanceEntries: { date: string; bal: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);

    // Capture the running balance before any row-skipping — marker rows like
    // "Ending balance as of …" carry the figure we want.
    if (balIdx >= 0) {
      const balDate = normalizeDate(cols[dateIdx]?.trim() ?? '');
      const balRaw  = cols[balIdx]?.replace(/[$,\s]/g, '') ?? '';
      const balNum  = parseFloat(balRaw);
      if (balDate && !isNaN(balNum)) balanceEntries.push({ date: balDate, bal: balNum });
    }

    if (typeIdx >= 0 && SKIP_TYPES.has(cols[typeIdx]?.trim().toLowerCase() ?? '')) continue;

    const rawDesc = cols[descIdx]?.trim() ?? '';
    if (SKIP_DESC.test(rawDesc)) continue;

    let amount: number;
    if (splitMode) {
      const debit  = parseAmt(cols[debitIdx]);
      const credit = parseAmt(cols[creditIdx]);
      if (isNaN(debit) && isNaN(credit)) continue;
      amount = (!isNaN(debit) && debit !== 0) ? -Math.abs(debit) : Math.abs(credit);
    } else {
      amount = parseAmt(cols[amountIdx]);
      if (isNaN(amount)) continue;
    }

    const rawDate = cols[dateIdx]?.trim() ?? '';
    const date    = normalizeDate(rawDate);

    const action = actionIdx >= 0 ? cols[actionIdx]?.trim() ?? '' : '';
    let name = rawDesc;
    if (action) {
      const label = symbolIdx >= 0 && cols[symbolIdx]?.trim() ? `${action} - ${cols[symbolIdx].trim()}` : action;
      name = rawDesc && rawDesc.toLowerCase() !== action.toLowerCase() ? `${label} (${rawDesc})` : label;
    }
    if (!date || !name) continue;

    const refRaw = refIdx >= 0 ? cols[refIdx]?.trim().replace(/\s+/g, ' ') : '';
    /* Use bank's transaction ID when available; otherwise a stable composite.
       amount.toFixed(2) prevents floating-point string differences between imports. */
    const referenceNumber = refRaw || `${date}|${name}|${amount.toFixed(2)}`;

    rows.push({ date, referenceNumber, name, amount });
  }

  // Current balance = running balance of the chronologically-latest row. Handles
  // both sort orders: take the last row when oldest-first, the first when newest-first.
  let finalBalance: number | undefined;
  if (balanceEntries.length > 0) {
    const first = balanceEntries[0];
    const last  = balanceEntries[balanceEntries.length - 1];
    const ascending = first.date <= last.date; // oldest-first
    finalBalance = ascending ? last.bal : first.bal;
  }

  return { rows, finalBalance };
}

/* MM/DD/YYYY → YYYY-MM-DD; already ISO dates pass through unchanged.
   Schwab-style "07/30/2026 as of 07/29/2026" (settlement "as of" trade date) —
   take the settlement date, the first one, and drop the rest. */
function normalizeDate(rawIn: string): string {
  const raw = rawIn.split(/\s+as of\s+/i)[0].trim();
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) return `${mdyMatch[3]}-${mdyMatch[1].padStart(2,'0')}-${mdyMatch[2].padStart(2,'0')}`;
  const dmyMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2,'0')}-${dmyMatch[1].padStart(2,'0')}`;
  return raw; // already YYYY-MM-DD or other ISO
}

function parseAmt(raw: string | undefined): number {
  if (!raw) return NaN;
  const s = raw.replace(/[^0-9.\-]/g, '');
  return s ? parseFloat(s) : NaN;
}

function parseRow(line: string): string[] {
  const cols: string[] = [];
  let cur = '', inQuote = false;
  for (const c of line) {
    if (c === '"') { inQuote = !inQuote; continue; }
    if (c === ',' && !inQuote) { cols.push(cur); cur = ''; continue; }
    cur += c;
  }
  cols.push(cur);
  return cols;
}
