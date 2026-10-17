import { describe, it, expect } from 'vitest';
import { quickPickIcons } from './category-icons';
import { EMOJI_OPTIONS } from '../emoji-groups';

describe('quickPickIcons', () => {
  it('suggests vehicle expenses for a vehicle project', () => {
    const icons = quickPickIcons('vehicle');
    for (const em of ['🔧', '⛽', '🛞']) expect(icons).toContain(em);
  });

  it('treats product and service businesses the same', () => {
    expect(quickPickIcons('service')).toEqual(quickPickIcons('business'));
  });

  it('falls back to a general set for an unknown type', () => {
    // Legacy or future project types still get one-tap icons.
    expect(quickPickIcons('something-new')).toEqual(quickPickIcons('other'));
  });

  it('gives every type ten distinct icons', () => {
    for (const t of ['vehicle', 'property', 'business', 'service', 'trading', 'other']) {
      const icons = quickPickIcons(t);
      expect(icons).toHaveLength(10);
      expect(new Set(icons).size).toBe(10);
    }
  });

  // The full picker highlights the current icon; a quick pick it can't show
  // would look unselected the moment the user opens "More".
  it('only suggests icons the full picker also offers', () => {
    for (const t of ['vehicle', 'property', 'business', 'trading', 'other']) {
      for (const em of quickPickIcons(t)) expect(EMOJI_OPTIONS).toContain(em);
    }
  });
});
