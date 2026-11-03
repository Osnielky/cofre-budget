import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChartTooltipContent } from './ChartTooltipContent';

type Props = Parameters<typeof ChartTooltipContent>[0];
type Entry = Record<string, unknown>;
type Loose = { active?: boolean; payload: Entry[]; label?: string | number;
  formatter?: (v: unknown, name: unknown, item: { payload: Entry }) => unknown; labelFormatter?: (l: unknown) => string };

/* recharts' Payload type demands internal ids the body never reads; the tests build only what it does. */
const html = (props: Loose) =>
  renderToStaticMarkup(<ChartTooltipContent {...({ active: true, ...props } as unknown as Props)} />);

describe('ChartTooltipContent', () => {
  it('renders nothing when inactive or empty', () => {
    expect(html({ active: false, payload: [{ name: 'Spent', value: 10 }] })).toBe('');
    expect(html({ payload: [] })).toBe('');
  });

  it('never uses recharts\' black fallback: text is the theme colour even when the series has no fill', () => {
    const out = html({ label: 'Thu', payload: [{ name: 'avg', value: 495.81, dataKey: 'avg' }] });
    expect(out).toContain('var(--color-text-primary)');
    expect(out).not.toContain('#000');
    expect(out).not.toMatch(/color:\s*black/);
  });

  it('shows the series colour as a swatch, not as the text colour', () => {
    const out = html({ label: 'Jan', payload: [{ name: 'Income', value: 100, color: '#22C55E' }] });
    expect(out).toContain('background-color:#22C55E');
    expect(out).not.toMatch(/[^-]color:#22C55E/);
    expect(out).toContain('Income');
    expect(out).toContain('100');
  });

  it('applies the formatter for value and name, and skips rows it returns null for', () => {
    const out = html({
      label: 'Thu',
      payload: [
        { name: 'avg', value: 495.81, dataKey: 'avg', payload: { total: 2479.03 } },
        { name: 'hidden', value: 1, dataKey: 'hidden' },
      ],
      formatter: (v, name, item) => (name === 'hidden' ? null : [`$${v} avg · $${item.payload.total} total`, 'Thursday']),
    });
    expect(out).toContain('$495.81 avg · $2479.03 total');
    expect(out).toContain('Thursday');
    expect(out).not.toContain('hidden');
  });

  it('shows the value alone when the formatter blanks the name, and formats the label', () => {
    const out = html({
      label: 3,
      payload: [{ name: 'value', value: 42 }],
      formatter: (v) => [`$${v}`, ''],
      labelFormatter: (l) => `Day ${l}`,
    });
    expect(out).toContain('Day 3');
    expect(out).toContain('$42');
    expect(out).not.toContain('>value<');
  });

  it('omits the label line when there is no label', () => {
    const out = html({ payload: [{ name: 'Net worth', value: 7 }] });
    expect(out).not.toContain('<p');
    expect(out).toContain('Net worth');
  });
});
