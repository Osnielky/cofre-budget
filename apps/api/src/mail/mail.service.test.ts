import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { setLogSink } from '../common/logging/log';

let lines: Array<Record<string, any>> = [];
beforeEach(() => { lines = []; setLogSink((l) => lines.push(JSON.parse(l))); });
afterEach(() => setLogSink(null));

function mailWith(send: () => Promise<unknown>): MailService {
  const config = { get: (k: string, d?: string) => ({ RESEND_API_KEY: 're_test_key' } as Record<string, string>)[k] ?? d } as unknown as ConfigService;
  const mail = new MailService(config);
  (mail as any).resend = { emails: { send } };
  return mail;
}

describe('MailService with Resend', () => {
  // Resend's SDK never throws: a rejected key or unverified domain comes back as { error }.
  it('treats a Resend { error } result as a failed send', async () => {
    const mail = mailWith(async () => ({ data: null, error: { name: 'validation_error', message: 'The domain is not verified' } }));
    await expect(mail.sendVerification('owner@cofre.dev', 'Owner', 'https://x/verify')).rejects.toThrow('The domain is not verified');
    expect(lines.find((l) => l.external)?.external).toMatchObject({ service: 'resend', ok: false, errorCode: 'validation_error' });
  });

  it('never logs the recipient address', async () => {
    const mail = mailWith(async () => ({ data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests' } }));
    await mail.sendVerification('owner@cofre.dev', 'Owner', 'https://x/verify').catch(() => {});
    expect(JSON.stringify(lines)).not.toContain('owner@cofre.dev');
  });

  it('logs a successful send as ok', async () => {
    const mail = mailWith(async () => ({ data: { id: 'email_1' }, error: null }));
    await mail.sendVerification('owner@cofre.dev', 'Owner', 'https://x/verify');
    expect(lines.find((l) => l.external)?.external).toMatchObject({ service: 'resend', ok: true });
  });
});
