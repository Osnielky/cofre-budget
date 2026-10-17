import { describe, it, expect } from 'vitest';
import { readJsonBody, browserErrorFields } from './report-body';

const req = (body: string) => new Request('http://x/report', { method: 'POST', body });

describe('readJsonBody', () => {
  it('parses a small JSON body', async () => {
    expect(await readJsonBody(req('{"a":1}'), 100)).toEqual({ a: 1 });
  });

  it('drops a body over the limit without parsing it', async () => {
    expect(await readJsonBody(req(JSON.stringify({ a: 'x'.repeat(500) })), 100)).toBeNull();
  });

  it('drops a body that is not JSON', async () => {
    expect(await readJsonBody(req('garbage'), 100)).toBeNull();
  });
});

describe('browserErrorFields', () => {
  it('caps every field an anonymous caller controls', () => {
    const f = browserErrorFields({
      message: 'm'.repeat(5000),
      stack: 's'.repeat(50_000),
      digest: 'd'.repeat(5000),
      url: 'https://h/' + 'p'.repeat(5000),
    })!;
    expect(f.message.length).toBeLessThanOrEqual(500);
    expect(String(f.fields.stack_trace).length).toBeLessThanOrEqual(8000);
    expect(String(f.fields.digest).length).toBeLessThanOrEqual(100);
    expect(String(f.fields.page).length).toBeLessThanOrEqual(200);
  });

  it('keeps the page path without its query', () => {
    expect(browserErrorFields({ message: 'x', url: 'https://h/reset-password?token=abc' })!.fields.page).toBe('/reset-password');
  });

  it('ignores a non-object body', () => {
    expect(browserErrorFields('nope')).toBeNull();
  });
});
