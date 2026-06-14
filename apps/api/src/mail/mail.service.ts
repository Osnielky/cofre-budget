import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger('MailService');
  private resend: Resend | null = null;
  private readonly from: string;

  constructor(private config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY');
    this.from = this.config.get<string>('MAIL_FROM') ?? 'Cofre <onboarding@resend.dev>';
    if (key) {
      this.resend = new Resend(key);
    } else {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged to the console instead of sent.');
    }
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    await this.send(
      to,
      'Verify your Cofre account',
      this.codeTemplate({
        heading: 'Confirm your email',
        intro: 'Welcome to Cofre. Use the code below to verify your email address and activate your account.',
        code,
      }),
    );
  }

  async sendResetCode(to: string, code: string): Promise<void> {
    await this.send(
      to,
      'Reset your Cofre password',
      this.codeTemplate({
        heading: 'Reset your password',
        intro: 'We received a request to reset your password. Enter the code below to choose a new one. If you did not request this, you can safely ignore this email.',
        code,
      }),
    );
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      // Dev fallback — surface the code in the API console so the flow is testable.
      const codeMatch = html.match(/letter-spacing:[^>]*>(\d{6})</);
      this.logger.log(`✉️  [DEV EMAIL] To: ${to} | ${subject}${codeMatch ? ` | CODE: ${codeMatch[1]}` : ''}`);
      return;
    }
    try {
      const { error } = await this.resend.emails.send({ from: this.from, to, subject, html });
      if (error) this.logger.error(`Resend error sending to ${to}: ${JSON.stringify(error)}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}`, err as Error);
    }
  }

  private codeTemplate({ heading, intro, code }: { heading: string; intro: string; code: string }): string {
    return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#06101E;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#06101E;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0B1C3F;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
          <tr><td style="padding:40px 40px 28px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#F5C842;letter-spacing:-0.01em;">Cofre</div>
            <div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#8BA3C7;margin-top:6px;">Wealth &amp; Budget</div>
          </td></tr>
          <tr><td style="padding:0 40px;">
            <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#F0F4FF;">${heading}</h1>
            <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#93A9CC;">${intro}</p>
          </td></tr>
          <tr><td style="padding:0 40px 8px;text-align:center;">
            <div style="display:inline-block;background:rgba(245,200,66,0.10);border:1px solid rgba(245,200,66,0.30);border-radius:14px;padding:18px 28px;">
              <span style="font-size:34px;font-weight:800;color:#F5C842;letter-spacing:0.4em;">${code}</span>
            </div>
          </td></tr>
          <tr><td style="padding:24px 40px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#54719C;">This code expires in 15 minutes.</p>
          </td></tr>
        </table>
        <p style="max-width:480px;margin:20px auto 0;font-size:11px;color:#3D5A80;text-align:center;">You're receiving this because someone used this address to sign up for Cofre.</p>
      </td></tr>
    </table>
  </body>
</html>`;
  }
}
