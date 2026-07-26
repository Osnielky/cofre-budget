import { describe, it, expect } from 'vitest';
import { extractPlainText, extractTotal, extractMerchantName, extractOrderNumber, extractOrderDate, extractLineItems, extractTables, parseReceiptEmail } from './receipt-parser';

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
