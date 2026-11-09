import { describe, expect, it } from 'vitest';
import { clampPct, describeDelta, formatChange } from './statTile';

describe('describeDelta', () => {
  it('hides the chip when there is no comparison or nothing changed', () => {
    expect(describeDelta(null)).toBeNull();
    expect(describeDelta({ value: null })).toBeNull();
    expect(describeDelta({ value: 0.3 })).toBeNull();
    expect(describeDelta({ value: -0.49 })).toBeNull();
    expect(describeDelta({ value: 0, unit: 'money' })).toBeNull();
    expect(describeDelta({ value: Number.NaN })).toBeNull();
  });

  it('shows "new" and "— flat" placeholders when asked (Reports)', () => {
    expect(describeDelta({ value: null, placeholders: true })).toEqual({ text: 'new', tone: 'flat' });
    expect(describeDelta({ value: 0.2, placeholders: true })).toEqual({ text: '— flat', tone: 'flat' });
  });

  it('colours a rise green and a drop rose, the other way round when inverse', () => {
    expect(describeDelta({ value: 12 })).toEqual({ text: '↑ 12%', tone: 'good' });
    expect(describeDelta({ value: -12 })).toEqual({ text: '↓ 12%', tone: 'bad' });
    expect(describeDelta({ value: 12, inverse: true })).toEqual({ text: '↑ 12%', tone: 'bad' });
    expect(describeDelta({ value: -12, inverse: true })).toEqual({ text: '↓ 12%', tone: 'good' });
  });

  it('keeps one decimal under 10 and none from 10 up', () => {
    expect(formatChange(3.44)).toBe('3.4');
    expect(formatChange(9.96)).toBe('10.0');
    expect(formatChange(10)).toBe('10');
    expect(formatChange(123.7)).toBe('124');
    expect(describeDelta({ value: 3.44 })!.text).toBe('↑ 3.4%');
  });

  it('renders points and money units', () => {
    expect(describeDelta({ value: 1.25, unit: 'pts' })).toEqual({ text: '↑ 1.3 pts', tone: 'good' });
    expect(describeDelta({ value: 12050, unit: 'money', format: (n) => `+$${(n / 100).toFixed(2)}` }))
      .toEqual({ text: '+$120.50', tone: 'good' });
    expect(describeDelta({ value: -1234.5, unit: 'money' })).toEqual({ text: '−$1,234.50', tone: 'bad' });
    expect(describeDelta({ value: 50, unit: 'money', inverse: true })).toEqual({ text: '+$50.00', tone: 'bad' });
  });
});

describe('clampPct', () => {
  it('keeps a bar inside 0–100 and never NaN', () => {
    expect(clampPct(42.5)).toBe(42.5);
    expect(clampPct(-3)).toBe(0);
    expect(clampPct(180)).toBe(100);
    expect(clampPct(Number.NaN)).toBe(0);
    expect(clampPct(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
