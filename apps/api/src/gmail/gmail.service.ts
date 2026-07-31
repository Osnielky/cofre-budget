import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { google } from 'googleapis';
import { ConnectedApp } from '../connected-apps/connected-app.entity';
import { deriveKey, encryptToken, decryptToken } from '../common/token-crypto.util';
import { parseReceiptEmail } from './receipt-parser';

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
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private config: ConfigService,
    private jwtService: JwtService,
    @InjectRepository(ConnectedApp) private repo: Repository<ConnectedApp>,
  ) {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is required for GmailService token encryption');
    this.encKey = deriveKey(secret);
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
    record.accessToken = encryptToken(tokens.access_token ?? '', this.encKey);
    record.refreshToken = encryptToken(tokens.refresh_token ?? record.refreshToken ?? '', this.encKey);
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
        client.setCredentials({ refresh_token: decryptToken(conn.refreshToken, this.encKey) });
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
      access_token: decryptToken(conn.accessToken, this.encKey),
      refresh_token: decryptToken(conn.refreshToken, this.encKey),
      expiry_date: conn.tokenExpiry ? Number(conn.tokenExpiry) : undefined,
    });
    // Only refresh if the token is expired or about to expire (within 60 seconds)
    const isExpired = !conn.tokenExpiry || Date.now() >= Number(conn.tokenExpiry) - 60_000;
    if (isExpired) {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      if (credentials.access_token && credentials.access_token !== decryptToken(conn.accessToken, this.encKey)) {
        conn.accessToken = encryptToken(credentials.access_token, this.encKey);
        conn.tokenExpiry = credentials.expiry_date ?? conn.tokenExpiry;
        await this.repo.save(conn);
      }
    }
    return client;
  }

  async fetchAndParseReceipts(userId: string): Promise<RawReceipt[]> {
    const QUERY =
      'subject:(receipt OR invoice OR "order confirmation" OR "your order" OR "payment received") newer_than:90d';
    return this.searchReceipts(userId, QUERY, 50);
  }

  /** Search Gmail with an arbitrary query and parse each hit into a receipt. */
  async searchReceipts(userId: string, query: string, maxResults = 10): Promise<RawReceipt[]> {
    const client = await this.getAuthorizedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    const messages = listRes.data.messages ?? [];
    const results: RawReceipt[] = [];
    this.logger.log(`Gmail search "${query}" matched ${messages.length} message(s) for user ${userId}`);

    for (const msg of messages) {
      if (!msg.id) continue;
      const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers = full.data.payload?.headers ?? [];
      const subject = this.extractHeader(headers, 'Subject');
      const from = this.extractHeader(headers, 'From');
      const dateHeader = this.extractHeader(headers, 'Date') || null;
      const body = this.extractBody(full.data.payload);
      if (!body) {
        this.logger.warn(`No text/html body extracted for message ${msg.id} ("${subject}"), mimeType=${full.data.payload?.mimeType}, skipping`);
        continue;
      }
      let parsed: ReturnType<typeof parseReceiptEmail>;
      try {
        parsed = parseReceiptEmail({ html: body, subject, from, dateHeader });
      } catch (err) {
        this.logger.warn(`Failed to parse message ${msg.id} ("${subject}"): ${(err as Error)?.message}, skipping`);
        continue;
      }
      if (!parsed) {
        this.logger.warn(`No total found in message ${msg.id} ("${subject}"), skipping — likely not a receipt`);
        continue;
      }
      results.push({ gmailMessageId: msg.id, subject, ...parsed });
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
}
