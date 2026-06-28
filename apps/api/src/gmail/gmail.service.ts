import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { google } from 'googleapis';
import * as crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { ConnectedApp } from '../connected-apps/connected-app.entity';

export interface RawReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface RawReceipt {
  gmailMessageId: string;
  subject: string;
  merchant: string;
  orderNumber: string | null;
  orderDate: string | null;
  currency: string;
  total: number;
  items: RawReceiptItem[];
}

@Injectable()
export class GmailService {
  private readonly encKey: Buffer;
  private readonly anthropic: Anthropic;

  constructor(
    private config: ConfigService,
    private jwtService: JwtService,
    @InjectRepository(ConnectedApp) private repo: Repository<ConnectedApp>,
  ) {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is required for GmailService token encryption');
    this.encKey = crypto.createHash('sha256').update(secret).digest();
    const anthropicKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : new Anthropic();
  }

  private makeOAuth2Client() {
    return new google.auth.OAuth2(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      this.config.get<string>('GOOGLE_GMAIL_REDIRECT_URI', 'http://localhost:3333/api/gmail/callback'),
    );
  }

  buildAuthUrl(userId: string, nonce: string): string {
    const state = this.jwtService.sign({ userId, nonce }, { expiresIn: '5m' });
    const client = this.makeOAuth2Client();
    return client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/userinfo.email'],
      prompt: 'consent',
      state,
    });
  }

  async handleCallback(code: string, state: string, cookieNonce: string | undefined): Promise<void> {
    let userId: string;
    let stateNonce: string;
    try {
      const payload = this.jwtService.verify(state) as { userId: string; nonce: string };
      userId = payload.userId;
      stateNonce = payload.nonce;
    } catch {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }
    if (!cookieNonce || !stateNonce || cookieNonce !== stateNonce) {
      throw new UnauthorizedException('OAuth nonce mismatch — possible CSRF');
    }

    const client = this.makeOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email ?? '';

    const existing = await this.repo.findOneBy({ userId, provider: 'gmail' });
    const record = existing ?? this.repo.create({ userId, provider: 'gmail' });
    record.email = email;
    record.accessToken = this.encrypt(tokens.access_token ?? '');
    record.refreshToken = this.encrypt(tokens.refresh_token ?? record.refreshToken ?? '');
    record.tokenExpiry = tokens.expiry_date ?? null;
    await this.repo.save(record);
  }

  async getConnection(userId: string): Promise<ConnectedApp | null> {
    return this.repo.findOneBy({ userId, provider: 'gmail' });
  }

  async disconnect(userId: string): Promise<void> {
    const conn = await this.repo.findOneBy({ userId, provider: 'gmail' });
    if (conn?.refreshToken) {
      try {
        const client = this.makeOAuth2Client();
        client.setCredentials({ refresh_token: this.decrypt(conn.refreshToken) });
        await client.revokeCredentials();
      } catch {
        // best-effort — still delete the local record even if revocation fails
      }
    }
    await this.repo.delete({ userId, provider: 'gmail' });
  }

  async getAuthorizedClient(userId: string) {
    const conn = await this.getConnection(userId);
    if (!conn) throw new UnauthorizedException('Gmail not connected');
    const client = this.makeOAuth2Client();
    client.setCredentials({
      access_token: this.decrypt(conn.accessToken),
      refresh_token: this.decrypt(conn.refreshToken),
      expiry_date: conn.tokenExpiry ? Number(conn.tokenExpiry) : undefined,
    });
    // Only refresh if the token is expired or about to expire (within 60 seconds)
    const isExpired = !conn.tokenExpiry || Date.now() >= Number(conn.tokenExpiry) - 60_000;
    if (isExpired) {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      if (credentials.access_token && credentials.access_token !== this.decrypt(conn.accessToken)) {
        conn.accessToken = this.encrypt(credentials.access_token);
        conn.tokenExpiry = credentials.expiry_date ?? conn.tokenExpiry;
        await this.repo.save(conn);
      }
    }
    return client;
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
  }

  private decrypt(text: string): string {
    if (!text || !text.includes(':')) return '';
    const parts = text.split(':');
    if (parts.length !== 3) return '';
    const [ivHex, tagHex, dataHex] = parts;
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    } catch {
      return '';
    }
  }

  async fetchAndParseReceipts(userId: string): Promise<RawReceipt[]> {
    const client = await this.getAuthorizedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });

    const QUERY =
      'from:(ship-confirm@amazon.com OR auto-confirm@amazon.com OR doordash.com OR ubereats.com OR order@walmart.com OR no-reply@apple.com OR noreply@doordash.com) newer_than:90d';

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: QUERY,
      maxResults: 50,
    });

    const messages = listRes.data.messages ?? [];
    const results: RawReceipt[] = [];

    for (const msg of messages) {
      if (!msg.id) continue;
      const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const subject = this.extractHeader(full.data.payload?.headers ?? [], 'Subject');
      const body = this.extractBody(full.data.payload);
      if (!body) continue;
      const parsed = await this.parseWithClaude(body, subject);
      if (parsed) {
        results.push({ gmailMessageId: msg.id, subject, ...parsed });
      } else {
        // Parse failed — store a fallback receipt so the email is not silently lost
        results.push({
          gmailMessageId: msg.id,
          subject,
          merchant: subject.slice(0, 100) || 'Unknown Merchant',
          orderNumber: null,
          orderDate: null,
          currency: 'USD',
          total: 0,
          items: [{ name: 'Order total (parsing failed — check email for details)', quantity: 1, unitPrice: 0, total: 0 }],
        });
      }
    }

    return results;
  }

  private extractHeader(headers: any[], name: string): string {
    return headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
  }

  private extractBody(payload: any): string {
    if (!payload) return '';
    if (payload.mimeType === 'text/html' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf8');
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        const text = this.extractBody(part);
        if (text) return text;
      }
    }
    return '';
  }

  private async parseWithClaude(
    emailHtml: string,
    subject: string,
  ): Promise<Omit<RawReceipt, 'gmailMessageId' | 'subject'> | null> {
    const truncated = emailHtml.slice(0, 8000);
    const prompt = `You are a receipt parser. Extract purchase data from this merchant receipt email and return ONLY valid JSON (no markdown, no explanation).

Email subject: ${subject}

Email body (HTML):
${truncated}

Return this exact JSON shape:
{
  "merchant": "string (merchant name, e.g. Amazon)",
  "orderNumber": "string or null",
  "orderDate": "YYYY-MM-DD or null",
  "currency": "USD",
  "total": number,
  "items": [
    { "name": "string", "quantity": number, "unitPrice": number, "total": number }
  ]
}

If you cannot find a clear order total or any items, return null.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
      if (text === 'null' || !text) return null;
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
