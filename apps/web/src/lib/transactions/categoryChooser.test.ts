import { describe, it, expect } from 'vitest';
import { matchCategories, matchProjects } from './categoryChooser';

const c = (id: string, name: string) => ({ id, name, icon: '•', color: '#888' });
const cats = [c('1', 'Groceries'), c('2', 'Gas'), c('3', 'Gym')];
const projects = [
  { id: 'p1', name: 'Trading', icon: '📈', categories: [c('a', 'Commissions & Fees'), c('b', 'Platform & Data')] },
  { id: 'p2', name: 'Rental House', icon: '🏠', categories: [c('x', 'Repairs'), c('y', 'Gas & Utilities')] },
  { id: 'p3', name: 'Empty', icon: '∅', categories: [] },
];

describe('category chooser search', () => {
  it('returns everything for an empty query, dropping projects without categories', () => {
    expect(matchCategories(cats, '  ')).toHaveLength(3);
    expect(matchProjects(projects, '').map((h) => h.project.id)).toEqual(['p1', 'p2']);
  });
  it('matches category names case-insensitively', () => {
    expect(matchCategories(cats, 'GA').map((x) => x.id)).toEqual(['2']);
    expect(matchProjects(projects, 'gas').map((h) => [h.project.id, h.categories.map((x) => x.id)])).toEqual([['p2', ['y']]]);
  });
  it('a project-name match brings all of its categories', () => {
    expect(matchProjects(projects, 'trad')[0].categories.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
