import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

function money(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend = new Resend(this.config.get<string>('RESEND_API_KEY') ?? '');
  private readonly from = this.config.get<string>('MAIL_FROM') ?? 'Cofre <onboarding@resend.dev>';
  private readonly appUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');

  constructor(private config: ConfigService) {}

  async sendVerification(to: string, name: string, link: string): Promise<void> {
    await this.send(
      to,
      'Verify your Cofre account',
      `Welcome to Cofre${name ? ', ' + name : ''}!`,
      'Confirm your email to finish setting up your account.',
      'Verify email',
      link,
    );
  }

  async sendPasswordReset(to: string, name: string, link: string): Promise<void> {
    await this.send(
      to,
      'Reset your Cofre password',
      'Password reset',
      'We received a request to reset your password. This link expires in 1 hour. If you didn’t ask for this, you can safely ignore this email.',
      'Reset password',
      link,
    );
  }

  async sendDebtReceipt(to: string, borrowerName: string, d: { lenderName: string; amountPaid: number; remaining: number }): Promise<void> {
    const body = `${esc(d.lenderName)} recorded your payment of <strong>${money(d.amountPaid)}</strong>.<br/><br/>`
      + `Remaining balance: <strong>${money(d.remaining)}</strong>.`;
    await this.sendPlain(to, 'Payment received', `Thank you${borrowerName ? ', ' + esc(borrowerName) : ''}!`, body);
  }

  async sendDebtStatement(to: string, borrowerName: string, d: { lenderName: string; principal: number; paid: number; remaining: number; payments: { amount: number; date: string }[] }): Promise<void> {
    const rows = d.payments
      .map((p) => `<tr><td style="padding:4px 0;color:#aeb4c2">${p.date}</td><td style="padding:4px 0;text-align:right;color:#E8E6DF">${money(p.amount)}</td></tr>`)
      .join('');
    const history = rows
      ? `<br/><br/><table style="width:100%;border-collapse:collapse;font-size:13px">`
        + `<tr><th align="left" style="color:#DDB877;padding-bottom:6px">Date</th><th align="right" style="color:#DDB877;padding-bottom:6px">Amount</th></tr>${rows}</table>`
      : '';
    const body = `Statement from ${esc(d.lenderName)}.<br/><br/>`
      + `Original amount: <strong>${money(d.principal)}</strong><br/>`
      + `Total paid: <strong>${money(d.paid)}</strong><br/>`
      + `Remaining balance: <strong>${money(d.remaining)}</strong>${history}`;
    await this.sendPlain(to, 'Your balance statement', `Statement for ${esc(borrowerName)}`, body);
  }

  private async sendPlain(to: string, subject: string, heading: string, bodyHtml: string): Promise<void> {
    try {
      await this.resend.emails.send({ from: this.from, to, subject, html: this.templatePlain(heading, bodyHtml) });
    } catch (err) {
      this.logger.error(`Failed to send "${subject}" to ${to}`, err as Error);
      throw err;
    }
  }

  private templatePlain(heading: string, bodyHtml: string): string {
    return `
<div style="background:#0B1322;padding:40px 0;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#141C32;border:1px solid #26314d;border-radius:16px;padding:36px 32px;color:#E8E6DF">
    <div style="font-size:13px;letter-spacing:0.28em;text-transform:uppercase;color:#DDB877;margin-bottom:20px">Cofre &middot; Wealth &amp; Budget</div>
    <h1 style="font-size:22px;margin:0 0 14px;color:#F2F1EA">${heading}</h1>
    <div style="font-size:14px;line-height:1.7;color:#cfd4de">${bodyHtml}</div>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #26314d">
      <p style="font-size:13px;line-height:1.6;color:#aeb4c2;margin:0 0 14px">
        This was sent with <strong style="color:#DDB877">Cofre</strong> — a simple, beautiful way to track your money,
        budgets, savings, and the loans you give or receive. Want to take control of your finances too?
      </p>
      <a href="${this.appUrl}/signup" style="display:inline-block;background:linear-gradient(180deg,#DDB877,#C9A05C);color:#131C30;font-weight:600;text-decoration:none;padding:11px 22px;border-radius:999px;font-size:12.5px;letter-spacing:0.06em">Try Cofre free</a>
    </div>
  </div>
</div>`;
  }

  private async send(to: string, subject: string, heading: string, body: string, cta: string, link: string): Promise<void> {
    try {
      await this.resend.emails.send({ from: this.from, to, subject, html: this.template(heading, body, cta, link) });
    } catch (err) {
      this.logger.error(`Failed to send "${subject}" to ${to}`, err as Error);
      throw err;
    }
  }

  private template(heading: string, body: string, cta: string, link: string): string {
    return `
<div style="background:#0B1322;padding:40px 0;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#141C32;border:1px solid #26314d;border-radius:16px;padding:36px 32px;color:#E8E6DF">
    <div style="font-size:13px;letter-spacing:0.28em;text-transform:uppercase;color:#DDB877;margin-bottom:20px">Cofre &middot; Wealth &amp; Budget</div>
    <h1 style="font-size:22px;margin:0 0 12px;color:#F2F1EA">${heading}</h1>
    <p style="font-size:14px;line-height:1.6;color:#aeb4c2;margin:0 0 28px">${body}</p>
    <a href="${link}" style="display:inline-block;background:linear-gradient(180deg,#DDB877,#C9A05C);color:#131C30;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:999px;font-size:13px;letter-spacing:0.06em">${cta}</a>
    <p style="font-size:11px;color:#6b7488;margin:28px 0 0;word-break:break-all">Or paste this link into your browser: ${link}</p>
  </div>
</div>`;
  }
}
