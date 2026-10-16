import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ChatMarkdown from './ChatMarkdown';

const html = (text: string) => renderToStaticMarkup(<ChatMarkdown text={text} />);

describe('ChatMarkdown', () => {
  it('renders bold and lists', () => {
    const out = html('**Current balances:**\n\n- GREY BOA\n- RED BOA');
    expect(out).toContain('<strong');
    expect(out).toContain('Current balances:');
    expect(out).toMatch(/<ul[^>]*>.*<li[^>]*>GREY BOA<\/li>/s);
  });

  it('renders GFM tables inside a scroll wrapper', () => {
    const out = html('| Card | Balance |\n|---|---|\n| GREY BOA | $1,645.96 |\n| RED BOA 1372 | $630.32 |');
    expect(out).toContain('overflow-x-auto');
    expect(out).toMatch(/<table[^>]*>/);
    expect(out).toMatch(/<th[^>]*>Card<\/th>/);
    expect(out).toMatch(/<td[^>]*>\$630\.32<\/td>/);
    expect(out).not.toContain('|---|');
  });

  it('never renders raw HTML from the reply', () => {
    const out = html('hi <script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
  });

  it('drops javascript: links and opens real links in a new tab', () => {
    expect(html('[x](javascript:alert(1))')).not.toContain('javascript:');
    const out = html('[Plaid](https://plaid.com)');
    expect(out).toContain('href="https://plaid.com"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});
