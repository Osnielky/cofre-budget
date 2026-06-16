import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend = new Resend(this.config.get<string>('RESEND_API_KEY') ?? '');
  private readonly from = this.config.get<string>('MAIL_FROM') ?? 'Cofre <onboarding@resend.dev>';

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
