import { describe, it, expect } from 'vitest';
import { validateDescription, dataUrlBytes, STATUS_LABELS, statusTone, MAX_SCREENSHOT_BYTES, viewportOf } from './report';

describe('validateDescription', () => {
  it('needs at least 10 characters after trimming', () => {
    expect(validateDescription('   short   ')).toMatch(/at least 10/);
    expect(validateDescription('The chart is blank today.')).toBeNull();
  });
  it('caps at 2000 characters', () => {
    expect(validateDescription('x'.repeat(2001))).toMatch(/2000/);
    expect(validateDescription('x'.repeat(2000))).toBeNull();
  });
});

describe('dataUrlBytes', () => {
  it('reports the decoded size of a base64 data URL', () => {
    const b64 = Buffer.alloc(300, 1).toString('base64');
    expect(dataUrlBytes(`data:image/jpeg;base64,${b64}`)).toBe(300);
    expect(dataUrlBytes(`data:image/png;base64,${Buffer.alloc(301, 1).toString('base64')}`)).toBe(301);
  });
  it('is zero for anything that is not a base64 data URL', () => {
    expect(dataUrlBytes('')).toBe(0);
    expect(dataUrlBytes('https://x/y.png')).toBe(0);
  });
  it('matches the API limit', () => {
    expect(MAX_SCREENSHOT_BYTES).toBe(1_048_576);
  });
});

describe('status labels', () => {
  it('has a label and tone for every status', () => {
    expect(STATUS_LABELS).toEqual({ open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' });
    expect(statusTone('resolved')).toBe('var(--color-green)');
    expect(statusTone('open')).toBe('var(--color-primary)');
  });
});

describe('viewportOf', () => {
  it('formats width x height', () => {
    expect(viewportOf({ innerWidth: 1440, innerHeight: 900 })).toBe('1440x900');
  });
});
