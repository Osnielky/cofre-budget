import { describe, it, expect } from 'vitest';
import { parseReportState, serializeReportState, DEFAULT_STATE, QUESTIONS, isQuestionActive, applyQuestion } from './state';

const parse = (qs: string) => parseReportState(new URLSearchParams(qs));

describe('parseReportState', () => {
  it('returns the defaults for an empty query', () => {
    expect(parse('')).toEqual(DEFAULT_STATE);
  });

  it('reads every control', () => {
    expect(parse('tab=spending&period=3m&account=acc1&by=wantNeed&sort=change&open=need')).toEqual({
      ...DEFAULT_STATE, tab: 'spending', preset: '3m', account: 'acc1', view: 'wantNeed', sort: 'change', open: 'need',
    });
  });

  it('keeps custom dates only when both are valid and ordered', () => {
    expect(parse('period=custom&from=2026-01-01&to=2026-03-31')).toMatchObject({ preset: 'custom', from: '2026-01-01', to: '2026-03-31' });
    expect(parse('period=custom&from=2026-03-31&to=2026-01-01')).toMatchObject({ preset: 'this-month', from: '', to: '' });
    expect(parse('period=custom&from=garbage')).toMatchObject({ preset: 'this-month' });
  });

  it('ignores unknown values instead of failing', () => {
    expect(parse('tab=nope&period=99y&by=colour&sort=sideways')).toEqual(DEFAULT_STATE);
  });
});

describe('serializeReportState', () => {
  it('writes nothing for the defaults and round-trips everything else', () => {
    expect(serializeReportState(DEFAULT_STATE)).toBe('');
    const s = { ...DEFAULT_STATE, tab: 'income' as const, preset: 'custom' as const, from: '2026-02-01', to: '2026-02-28', account: 'a1', view: 'fixed' as const, sort: 'change' as const, open: 'fixed' };
    expect(parse(serializeReportState(s))).toEqual(s);
  });

  it('drops custom dates when the preset is not custom', () => {
    expect(serializeReportState({ ...DEFAULT_STATE, preset: '3m', from: '2026-01-01', to: '2026-01-31' })).toBe('period=3m');
  });
});

describe('questions', () => {
  it('apply without touching the period or account, and report when active', () => {
    const base = { ...DEFAULT_STATE, preset: '6m' as const, account: 'a1', open: 'x' };
    const q = QUESTIONS.find((x) => x.id === 'changed')!;
    const next = applyQuestion(base, q);
    expect(next).toMatchObject({ tab: 'spending', view: 'category', sort: 'change', preset: '6m', account: 'a1', open: null });
    expect(isQuestionActive(next, q)).toBe(true);
    expect(isQuestionActive(next, QUESTIONS.find((x) => x.id === 'where')!)).toBe(false);
  });
});
