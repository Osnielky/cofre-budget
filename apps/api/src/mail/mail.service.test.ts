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

describe('MailService.sendBillingEmail', () => {
  it('renders the subject, every detail row, the features and the button, escaping user text', async () => {
    let sent: { to: string; subject: string; html: string } | null = null;
    const mail = mailWith(async (msg: any) => { sent = msg; return { data: { id: 'email_2' }, error: null }; });
    await mail.sendBillingEmail('owner@cofre.dev', {
      subject: 'Welcome to Cofre Pro',
      heading: 'Welcome to Cofre Pro',
      intro: 'Hi <script>x</script>, your plan is active.',
      rows: [['Plan', 'Pro · Monthly'], ['First payment', '$4.99 on October 29, 2026']],
      featuresTitle: "What's included in Pro",
      features: ['Ask Cofre AI assistant'],
      cta: { label: 'Open Cofre', href: 'https://budgetcofre.com/dashboard' },
    });
    expect(sent!.to).toBe('owner@cofre.dev');
    expect(sent!.subject).toBe('Welcome to Cofre Pro');
    for (const text of ['Pro · Monthly', '$4.99 on October 29, 2026', 'Ask Cofre AI assistant', 'Open Cofre', 'https://budgetcofre.com/dashboard']) {
      expect(sent!.html).toContain(text);
    }
    expect(sent!.html).not.toContain('<script>');
    expect(sent!.html).toContain('&lt;script&gt;');
  });
});
