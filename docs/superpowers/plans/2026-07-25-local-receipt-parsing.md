# Local Receipt Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Anthropic Claude call in Gmail receipt parsing with a self-contained, heuristic HTML parser (`cheerio`-based), so no email content leaves the server, and generalize matching from a 5-merchant sender whitelist to a subject-keyword search across any sender.

**Architecture:** A new pure-function module `apps/api/src/gmail/receipt-parser.ts` extracts total/merchant/order-number/order-date/line-items from raw HTML + headers. `GmailService` calls it instead of `parseWithClaude`, and its Gmail search query changes from a sender whitelist to a keyword search. All Anthropic wiring (SDK, API key, deploy secret) is removed; the privacy policy is updated to match.

**Tech Stack:** NestJS (existing), `cheerio` (new, pure-JS HTML parser), `vitest` (existing devDependency, not yet wired up for `apps/api` — this plan adds a `test:api` script).

## Global Constraints

- No email/receipt content may be sent to any third-party API. All parsing must run in-process.
- If no total can be found in a message, the message must be skipped entirely (not saved as a placeholder) — per the approved design's false-positive handling for the broadened keyword search.
- If a total is found but no line items can be extracted, fall back to a single line item equal to the total (same shape the old Claude-failure fallback used) — do not drop the receipt.
- `receipt-parser.ts` must have zero NestJS dependencies (plain functions/types only), so it stays independently testable.
- Currency is assumed USD (matches existing behavior — out of scope to add multi-currency detection).

---

### Task 1: `receipt-parser.ts` — text/total/merchant/order-number/order-date extraction

**Files:**
- Create: `apps/api/src/gmail/receipt-parser.ts`
- Test: `apps/api/src/gmail/receipt-parser.test.ts`
- Modify: `package.json` (add `cheerio` dependency, add `test:api` script)

**Interfaces:**
- Produces: `extractPlainText(html: string): string`, `extractTotal(text: string): number | null`, `extractMerchantName(fromHeader: string, subject: string): string`, `extractOrderNumber(text: string): string | null`, `extractOrderDate(text: string, emailDateHeader: string | null): string | null` — all consumed by Task 2's `parseReceiptEmail`.

- [ ] **Step 1: Add the `cheerio` dependency and a `test:api` script**

Edit `package.json`:
```diff
     "bcryptjs": "^3.0.3",
+    "cheerio": "^1.2.0",
     "cookie-parser": "^1.4.7",
```
```diff
     "seed": "node -r dotenv/config dist/seed.js",
+    "test:api": "vitest run --root apps/api",
     "test:dashboard": "vitest run --root apps/web"
```

Run: `npm install`
Expected: installs `cheerio` with no errors, lockfile updated.

- [ ] **Step 2: Write the failing tests**

Create `apps/api/src/gmail/receipt-parser.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractPlainText, extractTotal, extractMerchantName, extractOrderNumber, extractOrderDate } from './receipt-parser';

const AMAZON_HTML = `
<html><body>
<p>Order from Amazon</p>
<p>Order number 113-5177507-4387418</p>
<table>
<tr><td>Wireless Mouse</td><td>Qty: 1</td><td>$19.99</td></tr>
<tr><td>USB Cable</td><td>Qty: 2</td><td>$14.98</td></tr>
<tr><td>Subtotal</td><td></td><td>$34.97</td></tr>
<tr><td>Order Total</td><td></td><td>$34.97</td></tr>
</table>
<p>Order Date: July 20, 2026</p>
</body></html>
`;

const GENERIC_HTML = `
<html><body>
<p>Thank you for your payment.</p>
<p>Amount Charged: $45.00</p>
<p>Confirmation #: XYZ789</p>
</body></html>
`;

const NEWSLETTER_HTML = `
<html><body>
<p>Check out our weekly newsletter!</p>
<p>New arrivals in electronics and home goods.</p>
</body></html>
`;

describe('extractPlainText', () => {
  it('preserves block boundaries as line breaks', () => {
    const text = extractPlainText(AMAZON_HTML);
    expect(text).toContain('Order from Amazon');
    expect(text).toContain('Order number 113-5177507-4387418');
    expect(text.split('\n').length).toBeGreaterThan(3);
  });
});

describe('extractTotal', () => {
  it('finds "Order Total" and ignores "Subtotal"', () => {
    const text = extractPlainText(AMAZON_HTML);
    expect(extractTotal(text)).toBe(34.97);
  });

  it('finds "Amount Charged" phrasing', () => {
    const text = extractPlainText(GENERIC_HTML);
    expect(extractTotal(text)).toBe(45.0);
  });

  it('returns null when no total-like line exists', () => {
    const text = extractPlainText(NEWSLETTER_HTML);
    expect(extractTotal(text)).toBeNull();
  });
});

describe('extractMerchantName', () => {
  it('uses the From header display name', () => {
    expect(extractMerchantName('Amazon.com <auto-confirm@amazon.com>', 'Your order')).toBe('Amazon.com');
  });

  it('falls back to the domain when there is no display name', () => {
    expect(extractMerchantName('billing@someservice.com', 'Payment Receipt')).toBe('Someservice');
  });

  it('falls back to the subject when the From header is unparseable', () => {
    expect(extractMerchantName('', 'Your Payment Receipt')).toBe('Your Payment Receipt');
  });
});

describe('extractOrderNumber', () => {
  it('finds "Order number" phrasing', () => {
    const text = extractPlainText(AMAZON_HTML);
    expect(extractOrderNumber(text)).toBe('113-5177507-4387418');
  });

  it('finds "Confirmation #" phrasing', () => {
    const text = extractPlainText(GENERIC_HTML);
    expect(extractOrderNumber(text)).toBe('XYZ789');
  });

  it('returns null when no order number is present', () => {
    const text = extractPlainText(NEWSLETTER_HTML);
    expect(extractOrderNumber(text)).toBeNull();
  });
});

describe('extractOrderDate', () => {
  it('parses an explicit "Order Date:" phrase into YYYY-MM-DD', () => {
    const text = extractPlainText(AMAZON_HTML);
    expect(extractOrderDate(text, null)).toBe('2026-07-20');
  });

  it('falls back to the email Date header when no explicit order date exists', () => {
    const text = extractPlainText(GENERIC_HTML);
    expect(extractOrderDate(text, 'Mon, 21 Jul 2026 10:00:00 -0400')).toBe('2026-07-21');
  });

  it('returns null when neither is present', () => {
    const text = extractPlainText(NEWSLETTER_HTML);
    expect(extractOrderDate(text, null)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:api`
Expected: FAIL — `Cannot find module './receipt-parser'` (file doesn't exist yet).

- [ ] **Step 4: Write the implementation**

Create `apps/api/src/gmail/receipt-parser.ts`:
```ts
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

export function extractOrderDate(text: string, emailDateHeader: string | null): string | null {
  const explicit = text.match(ORDER_DATE_RE);
  if (explicit) {
    const parsed = new Date(explicit[1]);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  if (emailDateHeader) {
    const parsed = new Date(emailDateHeader);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:api`
Expected: PASS — all `describe` blocks green.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json apps/api/src/gmail/receipt-parser.ts apps/api/src/gmail/receipt-parser.test.ts
git commit -m "feat(gmail): add local receipt-parser text/total/merchant/order extraction"
```

---

### Task 2: Table/line-item extraction and the `parseReceiptEmail` orchestrator

**Files:**
- Modify: `apps/api/src/gmail/receipt-parser.ts`
- Modify: `apps/api/src/gmail/receipt-parser.test.ts`

**Interfaces:**
- Consumes: `extractPlainText`, `extractTotal`, `extractMerchantName`, `extractOrderNumber`, `extractOrderDate`, `ParsedItem`, `ParsedReceipt` (all from Task 1, same file).
- Produces: `parseReceiptEmail(input: { html: string; subject: string; from: string; dateHeader: string | null }): ParsedReceipt | null` — consumed by Task 3's `GmailService.searchReceipts`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/gmail/receipt-parser.test.ts`:
```ts
import { extractLineItems, extractTables, parseReceiptEmail } from './receipt-parser';

describe('extractTables / extractLineItems', () => {
  it('extracts item rows and excludes subtotal/total rows', () => {
    const tables = extractTables(AMAZON_HTML);
    const items = extractLineItems(tables);
    expect(items).toEqual([
      { name: 'Wireless Mouse', quantity: 1, unitPrice: 19.99, total: 19.99 },
      { name: 'USB Cable', quantity: 2, unitPrice: 7.49, total: 14.98 },
    ]);
  });

  it('returns an empty array when there are no tables', () => {
    const tables = extractTables(GENERIC_HTML);
    expect(extractLineItems(tables)).toEqual([]);
  });
});

describe('parseReceiptEmail', () => {
  it('parses a full table-based receipt', () => {
    const result = parseReceiptEmail({
      html: AMAZON_HTML,
      subject: 'Your Amazon.com order has shipped',
      from: 'Amazon.com <auto-confirm@amazon.com>',
      dateHeader: null,
    });
    expect(result).toEqual({
      merchant: 'Amazon.com',
      orderNumber: '113-5177507-4387418',
      orderDate: '2026-07-20',
      currency: 'USD',
      total: 34.97,
      items: [
        { name: 'Wireless Mouse', quantity: 1, unitPrice: 19.99, total: 19.99 },
        { name: 'USB Cable', quantity: 2, unitPrice: 7.49, total: 14.98 },
      ],
    });
  });

  it('falls back to a single line item when no items can be extracted', () => {
    const result = parseReceiptEmail({
      html: GENERIC_HTML,
      subject: 'Payment Receipt',
      from: 'billing@someservice.com',
      dateHeader: 'Mon, 21 Jul 2026 10:00:00 -0400',
    });
    expect(result).toEqual({
      merchant: 'Someservice',
      orderNumber: 'XYZ789',
      orderDate: '2026-07-21',
      currency: 'USD',
      total: 45.0,
      items: [{ name: 'Someservice order', quantity: 1, unitPrice: 45.0, total: 45.0 }],
    });
  });

  it('returns null when no total can be found (not a receipt)', () => {
    const result = parseReceiptEmail({
      html: NEWSLETTER_HTML,
      subject: 'This week in tech',
      from: 'newsletter@example.com',
      dateHeader: null,
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api`
Expected: FAIL — `extractLineItems`, `extractTables`, `parseReceiptEmail` are not exported yet.

- [ ] **Step 3: Write the implementation**

Append to `apps/api/src/gmail/receipt-parser.ts`:
```ts
const EXCLUDE_ROW_RE = /(sub\s*-?\s*total|^total$|grand\s*total|total\s*due|amount\s*charged|tax|shipping|discount|gift\s*card|promo)/i;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:api`
Expected: PASS — all tests green, including Task 1's.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/gmail/receipt-parser.ts apps/api/src/gmail/receipt-parser.test.ts
git commit -m "feat(gmail): add table-based line-item extraction and parseReceiptEmail orchestrator"
```

---

### Task 3: Wire `receipt-parser` into `GmailService`, remove Anthropic

**Files:**
- Modify: `apps/api/src/gmail/gmail.service.ts`

**Interfaces:**
- Consumes: `parseReceiptEmail`, `ReceiptEmailInput` from `./receipt-parser` (Task 2).

- [ ] **Step 1: Remove the Anthropic import, field, and constructor wiring**

In `apps/api/src/gmail/gmail.service.ts`, remove the Anthropic import:
```diff
 import { google } from 'googleapis';
-import Anthropic from '@anthropic-ai/sdk';
 import { ConnectedApp } from '../connected-apps/connected-app.entity';
 import { deriveKey, encryptToken, decryptToken } from '../common/token-crypto.util';
+import { parseReceiptEmail } from './receipt-parser';
```

Remove the `anthropic` field and its constructor setup:
```diff
 export class GmailService {
   private readonly encKey: Buffer;
-  private readonly anthropic: Anthropic;
   private readonly logger = new Logger(GmailService.name);

   constructor(
     private config: ConfigService,
     private jwtService: JwtService,
     @InjectRepository(ConnectedApp) private repo: Repository<ConnectedApp>,
   ) {
     const secret = this.config.get<string>('JWT_SECRET');
     if (!secret) throw new Error('JWT_SECRET is required for GmailService token encryption');
     this.encKey = deriveKey(secret);
-    const anthropicKey = this.config.get<string>('ANTHROPIC_API_KEY');
-    this.anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : new Anthropic();
   }
```

- [ ] **Step 2: Broaden the search query in `fetchAndParseReceipts`**

```diff
   async fetchAndParseReceipts(userId: string): Promise<RawReceipt[]> {
-    const QUERY =
-      'from:(ship-confirm@amazon.com OR auto-confirm@amazon.com OR doordash.com OR ubereats.com OR order@walmart.com OR no-reply@apple.com OR noreply@doordash.com) newer_than:90d';
+    const QUERY =
+      'subject:(receipt OR invoice OR "order confirmation" OR "your order" OR "payment received") newer_than:90d';
     return this.searchReceipts(userId, QUERY, 50);
   }
```

- [ ] **Step 3: Replace the `parseWithClaude` call site in `searchReceipts`**

```diff
     const messages = listRes.data.messages ?? [];
     const results: RawReceipt[] = [];
     this.logger.log(`Gmail search "${query}" matched ${messages.length} message(s) for user ${userId}`);

     for (const msg of messages) {
       if (!msg.id) continue;
       const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
-      const subject = this.extractHeader(full.data.payload?.headers ?? [], 'Subject');
+      const headers = full.data.payload?.headers ?? [];
+      const subject = this.extractHeader(headers, 'Subject');
+      const from = this.extractHeader(headers, 'From');
+      const dateHeader = this.extractHeader(headers, 'Date') || null;
       const body = this.extractBody(full.data.payload);
       if (!body) {
         this.logger.warn(`No text/html body extracted for message ${msg.id} ("${subject}"), mimeType=${full.data.payload?.mimeType}, skipping`);
         continue;
       }
-      const parsed = await this.parseWithClaude(body, subject);
-      if (parsed) {
-        results.push({ gmailMessageId: msg.id, subject, ...parsed });
-      } else {
-        // Parse failed — store a fallback receipt so the email is not silently lost
-        results.push({
-          gmailMessageId: msg.id,
-          subject,
-          merchant: subject.slice(0, 100) || 'Unknown Merchant',
-          orderNumber: null,
-          orderDate: null,
-          currency: 'USD',
-          total: 0,
-          items: [{ name: 'Order total (parsing failed — check email for details)', quantity: 1, unitPrice: 0, total: 0 }],
-        });
-      }
+      let parsed: ReturnType<typeof parseReceiptEmail>;
+      try {
+        parsed = parseReceiptEmail({ html: body, subject, from, dateHeader });
+      } catch (err) {
+        this.logger.warn(`Failed to parse message ${msg.id} ("${subject}"): ${(err as Error)?.message}, skipping`);
+        continue;
+      }
+      if (!parsed) {
+        this.logger.warn(`No total found in message ${msg.id} ("${subject}"), skipping — likely not a receipt`);
+        continue;
+      }
+      results.push({ gmailMessageId: msg.id, subject, ...parsed });
     }

     return results;
   }
```

- [ ] **Step 4: Remove the now-unused `parseWithClaude` method**

Delete the entire `parseWithClaude` private method (it's no longer called anywhere in the file).

- [ ] **Step 5: Build to verify it compiles**

Run: `npx nx build api`
Expected: `webpack compiled successfully`, no TypeScript errors, no references to `Anthropic` or `parseWithClaude` remaining.

- [ ] **Step 6: Run the parser unit tests once more (regression check)**

Run: `npm run test:api`
Expected: PASS — unaffected by this task, confirms nothing in Task 1/2 broke.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/gmail/gmail.service.ts
git commit -m "feat(gmail): use local receipt-parser instead of Anthropic; broaden search to any sender"
```

---

### Task 4: Remove the Anthropic dependency and deploy wiring

**Files:**
- Modify: `package.json`
- Modify: `deploy/ci-deploy.sh`

- [ ] **Step 1: Remove the npm dependency**

```diff
   "dependencies": {
-    "@anthropic-ai/sdk": "^0.106.0",
     "@nestjs/common": "^11.0.0",
```

Run: `npm install`
Expected: lockfile updated, `@anthropic-ai/sdk` removed from `node_modules` and `package-lock.json`.

- [ ] **Step 2: Confirm nothing else references it**

Run: `grep -rn "anthropic" apps/api/src apps/web/src --include=*.ts --include=*.tsx -i`
Expected: no output (Task 3 already removed the only usage in `gmail.service.ts`; Task 5 below removes the `/privacy` page's mention).

- [ ] **Step 3: Revert the `ANTHROPIC_API_KEY` deploy secret wiring**

In `deploy/ci-deploy.sh`:
```diff
-  --set-secrets "DB_PASS=DB_PASS:latest,JWT_SECRET=JWT_SECRET:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,RESEND_API_KEY=RESEND_API_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest"
+  --set-secrets "DB_PASS=DB_PASS:latest,JWT_SECRET=JWT_SECRET:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,RESEND_API_KEY=RESEND_API_KEY:latest"
```

(The `ANTHROPIC_API_KEY` secret in Secret Manager itself can stay — it's simply unused now. No action needed there.)

- [ ] **Step 4: Rebuild to confirm nothing broke**

Run: `npx nx build api`
Expected: `webpack compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json deploy/ci-deploy.sh
git commit -m "chore: remove @anthropic-ai/sdk dependency and deploy secret wiring"
```

---

### Task 5: Update the privacy policy to reflect local parsing

**Files:**
- Modify: `apps/web/src/app/privacy/page.tsx`

- [ ] **Step 1: Update the Gmail data paragraph**

Find the paragraph starting with `<strong ...>Gmail data</strong>` in `apps/web/src/app/privacy/page.tsx`. Replace the sentence describing Anthropic processing:

```diff
-        matching email&rsquo;s subject and body to extract the merchant, order number, date, total, and line items. That
-        extraction is performed by sending the email content to Anthropic&rsquo;s Claude API for parsing.
-        <strong style={{ color: 'var(--color-text-primary)' }}> We do not store the raw email body or attachments</strong> —
+        matching email&rsquo;s subject and body to extract the merchant, order number, date, total, and line items.
+        That extraction happens entirely on Cofre&rsquo;s own server — the email content is never sent to any
+        third-party AI or analysis service.
+        <strong style={{ color: 'var(--color-text-primary)' }}> We do not store the raw email body or attachments</strong> —
```

- [ ] **Step 2: Remove the Anthropic row from the third-parties list**

Find the `<ul>` under "4. Third parties we work with" and remove the Anthropic `<li>`:
```diff
         <li><strong style={{ color: 'var(--color-text-primary)' }}>Google</strong> — Gmail and Google Sign-In, as
           described above.</li>
-        <li><strong style={{ color: 'var(--color-text-primary)' }}>Anthropic</strong> — parses receipt email content
-          into structured data; the raw email is not retained by us or, to our knowledge, used by Anthropic to train
-          models.</li>
         <li><strong style={{ color: 'var(--color-text-primary)' }}>Resend</strong> — delivers transactional email
```

- [ ] **Step 3: Type-check to verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/privacy/page.tsx
git commit -m "docs(privacy): reflect local receipt parsing, drop Anthropic from third parties"
```

---

### Task 6: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Build the whole API**

Run: `npx nx build api`
Expected: `webpack compiled successfully`.

- [ ] **Step 2: Reconnect Gmail and load the Receipts page**

Using either the local dev environment or the deployed app (whichever has a working Gmail connection from earlier in this session), visit the Receipts page to trigger `syncAndFind` → `fetchAndParseReceipts`.

- [ ] **Step 3: Confirm the known Amazon email parses correctly**

Expected in the Receipts list: merchant "Amazon.com", order number `113-5177507-4387418`, total `$76.87` (the real values from the order confirmation email seen earlier in this session — actual line items will reflect that email's real table structure, not the test fixture's).

- [ ] **Step 4: Spot-check false-positive handling**

Confirm no placeholder/junk receipts appear for non-receipt emails that happened to match the broadened `subject:(receipt OR invoice OR ...)` keyword search — they should simply be absent (skipped), not shown with a `$0.00` total.

- [ ] **Step 5: Check API logs for the new diagnostic messages**

Confirm log lines like `Gmail search "..." matched N message(s)` and, for any skipped message, `No total found in message ... skipping` appear — these were added in an earlier session and remain the way to confirm the pipeline ran as expected.
