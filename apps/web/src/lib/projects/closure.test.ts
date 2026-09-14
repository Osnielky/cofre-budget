import { describe, it, expect } from 'vitest';
import {
  closureKind, closureActionLabel, closedStatusFor, isClosed, statusLabel,
  isValidClosure, SELLABLE_TYPES, TERMINABLE_TYPES,
} from './closure';

describe('closureKind', () => {
  it('treats held assets as things you sell', () => {
    for (const t of ['vehicle', 'property', 'other']) expect(closureKind(t)).toBe('sale');
  });

  it('treats ongoing operations as things you terminate', () => {
    for (const t of ['business', 'service', 'trading']) expect(closureKind(t)).toBe('termination');
  });

  it('falls back to sale for an unknown type', () => {
    // Legacy or future rows shouldn't lose their close button entirely.
    expect(closureKind('something-new')).toBe('sale');
  });

  it('covers every type exactly once between the two lists', () => {
    const overlap = SELLABLE_TYPES.filter((t) => (TERMINABLE_TYPES as readonly string[]).includes(t));
    expect(overlap).toEqual([]);
  });
});

describe('closureActionLabel', () => {
  it('names the action the way the type reads', () => {
    expect(closureActionLabel('vehicle')).toBe('Mark Sold');
    expect(closureActionLabel('service')).toBe('Terminate');
  });
});

describe('closedStatusFor', () => {
  it('maps each type to the status it closes into', () => {
    expect(closedStatusFor('property')).toBe('sold');
    expect(closedStatusFor('trading')).toBe('terminated');
  });
});

describe('isValidClosure', () => {
  it('accepts the status that matches the type', () => {
    expect(isValidClosure('vehicle', 'sold')).toBe(true);
    expect(isValidClosure('business', 'terminated')).toBe(true);
  });

  it('rejects selling an operation or terminating an asset', () => {
    // A consulting business is not "sold" here, and a car is not "terminated".
    expect(isValidClosure('service', 'sold')).toBe(false);
    expect(isValidClosure('vehicle', 'terminated')).toBe(false);
  });

  it('always allows returning to active — any project can be reactivated', () => {
    expect(isValidClosure('service', 'active')).toBe(true);
    expect(isValidClosure('vehicle', 'active')).toBe(true);
  });

  it('rejects a status that is not one of the three', () => {
    expect(isValidClosure('vehicle', 'archived')).toBe(false);
  });
});

describe('isClosed', () => {
  it('counts both closure kinds as closed', () => {
    expect(isClosed('sold')).toBe(true);
    expect(isClosed('terminated')).toBe(true);
  });

  it('does not count an active project', () => {
    expect(isClosed('active')).toBe(false);
  });
});

describe('statusLabel', () => {
  it('reads back the way the badge should', () => {
    expect(statusLabel('active')).toBe('Active');
    expect(statusLabel('sold')).toBe('Sold');
    expect(statusLabel('terminated')).toBe('Terminated');
  });
});
