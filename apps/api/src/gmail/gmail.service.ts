import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { google } from 'googleapis';
import * as crypto from 'crypto';
import { ConnectedApp } from '../connected-apps/connected-app.entity';

@Injectable()
export class GmailService {
  private readonly encKey: Buffer;

  constructor(
    private config: ConfigService,
    private jwtService: JwtService,
    @InjectRepository(ConnectedApp) private repo: Repository<ConnectedApp>,
  ) {
    const secret = this.config.get<string>('JWT_SECRET') ?? 'fallback-secret-32-chars-minimum!!';
    this.encKey = crypto.createHash('sha256').update(secret).digest();
  }

  private makeOAuth2Client() {
    return new google.auth.OAuth2(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      this.config.get<string>('GOOGLE_GMAIL_REDIRECT_URI', 'http://localhost:3333/api/gmail/callback'),
    );
  }

  buildAuthUrl(userId: string): string {
    const state = this.jwtService.sign({ userId }, { expiresIn: '5m' });
    const client = this.makeOAuth2Client();
    return client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/userinfo.email'],
      prompt: 'consent',
      state,
    });
  }

  async handleCallback(code: string, state: string): Promise<void> {
    let userId: string;
    try {
      const payload = this.jwtService.verify(state) as { userId: string };
      userId = payload.userId;
    } catch {
      throw new UnauthorizedException('Invalid or expired OAuth state');
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
    // Auto-refresh if expired
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    if (credentials.access_token && credentials.access_token !== this.decrypt(conn.accessToken)) {
      conn.accessToken = this.encrypt(credentials.access_token);
      conn.tokenExpiry = credentials.expiry_date ?? conn.tokenExpiry;
      await this.repo.save(conn);
    }
    return client;
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encKey, iv);
    return iv.toString('hex') + ':' + Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('hex');
  }

  private decrypt(text: string): string {
    const [ivHex, dataHex] = text.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encKey, Buffer.from(ivHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  }
}
