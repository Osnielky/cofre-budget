import { describe, it, expect } from 'vitest';
import { pickProjectSuggestion, normalizeTxName, type ProjectHint, type SuggestionTx } from './suggestions';

const PARTS: ProjectHint = {
  projectId: 'car',
  projectCategoryId: 'parts',
  catName: 'Parts',
  catIcon: '🔧',
  catColor: '#F07A3E',
};

const hints: Record<string, ProjectHint> = { 'AUTOZONE 1234': PARTS };

function tx(over: Partial<SuggestionTx> = {}): SuggestionTx {
  return { name: 'AUTOZONE 1234', categoryId: null, projectId: null, debtId: null, ...over };
}

describe('pickProjectSuggestion', () => {
  it('suggests the project category this name was filed under before', () => {
    expect(pickProjectSuggestion(tx(), hints, false)).toEqual(PARTS);
  });

  it('suggests even when a budget category is already assigned', () => {
    // A car-parts purchase usually arrives already categorized — by a
    // categorization rule, or by the name-pattern fallbacks. Suppressing the
    // suggestion in that case hid it exactly when it was most useful, since
    // filing under a project category clears the budget category anyway.
    expect(pickProjectSuggestion(tx({ categoryId: 'transport' }), hints, false)).toEqual(PARTS);
  });

  it('stays quiet once the row is already on a project', () => {
    expect(pickProjectSuggestion(tx({ projectId: 'car' }), hints, false)).toBeNull();
  });

  it('stays quiet for a debt repayment', () => {
    expect(pickProjectSuggestion(tx({ debtId: 'd1' }), hints, false)).toBeNull();
  });

  it('stays quiet for a transfer between accounts', () => {
    expect(pickProjectSuggestion(tx(), hints, true)).toBeNull();
  });

  it('has nothing to suggest for a name never filed under a project', () => {
    expect(pickProjectSuggestion(tx({ name: 'PUBLIX 99' }), hints, false)).toBeNull();
  });

  it('matches a name carrying a trailing confirmation code', () => {
    expect(pickProjectSuggestion(tx({ name: 'AUTOZONE 1234 conf#XY9' }), hints, false)).toEqual(PARTS);
  });
});

describe('normalizeTxName', () => {
  it('strips a trailing confirmation code', () => {
    expect(normalizeTxName('AUTOZONE 1234 conf#AB12')).toBe('AUTOZONE 1234');
  });

  it('strips a trailing run of six or more alphanumerics', () => {
    expect(normalizeTxName('ZELLE PAYMENT WFCT126NB7CP')).toBe('ZELLE PAYMENT');
  });

  it('leaves an ordinary name alone', () => {
    expect(normalizeTxName('AUTOZONE 1234')).toBe('AUTOZONE 1234');
  });
});
