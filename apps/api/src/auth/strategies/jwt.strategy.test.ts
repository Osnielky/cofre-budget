import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../users/user.entity';
import { UsersService } from '../../users/users.service';
import { ConnectedApp } from '../../connected-apps/connected-app.entity';
import { GmailService } from '../../gmail/gmail.service';
import { AuthService } from '../auth.service';
import { MailService } from '../../mail/mail.service';
import { JwtStrategy } from './jwt.strategy';

const JWT_SECRET = 'test-secret';

function fakeConfig(): ConfigService {
  const values: Record<string, string> = {
    JWT_SECRET,
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    FRONTEND_URL: 'http://localhost:3000',
  };
  return { get: (key: string, fallback?: string) => values[key] ?? fallback } as unknown as ConfigService;
}

// Captures the links AuthService would email instead of sending them.
class FakeMail {
  links: string[] = [];
  async sendVerification(_to: string, _name: string, link: string) { this.links.push(link); }
  async sendPasswordReset(_to: string, _name: string, link: string) { this.links.push(link); }
}

describe('JwtStrategy — only access tokens authenticate a request', () => {
  let ds: DataSource;
  let users: UsersService;
  let jwt: JwtService;
  let strategy: JwtStrategy;
  let auth: AuthService;
  let mail: FakeMail;
  let firstUser: User;
  let attacker: User;

  // Mirrors what passport-jwt does with a cookie/Bearer token: verify the
  // signature with JWT_SECRET, then hand the payload to validate().
  async function authenticate(token: string): Promise<User | null> {
    let payload: any;
    try {
      payload = jwt.verify(token, { secret: JWT_SECRET });
    } catch {
      return null;
    }
    return (await strategy.validate(payload)) ?? null;
  }

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      entities: [User, ConnectedApp],
      synchronize: true,
    });
    await ds.initialize();
    const config = fakeConfig();
    users = new UsersService(ds.getRepository(User));
    jwt = new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: '7d' } });
    strategy = new JwtStrategy(config, users);
    mail = new FakeMail();
    auth = new AuthService(users, jwt, config, mail as unknown as MailService);

    firstUser = await ds.getRepository(User).save({ email: 'owner@cofre.dev', name: 'Owner' });
    attacker = await ds.getRepository(User).save({ email: 'attacker@evil.dev', name: 'Attacker' });
  });

  it('accepts a login access token and resolves its own user', async () => {
    const { access_token } = auth.login(attacker);
    const user = await authenticate(access_token);
    expect(user?.id).toBe(attacker.id);
  });

  it('rejects the Gmail OAuth state token (it has no sub and would resolve the first user)', async () => {
    const gmail = new GmailService(fakeConfig(), jwt, ds.getRepository(ConnectedApp));
    const url = new URL(gmail.buildAuthUrl(attacker.id, 'nonce-123'));
    const state = url.searchParams.get('state')!;

    const user = await authenticate(state);
    expect(user?.id).not.toBe(firstUser.id);
    expect(user).toBeNull();
  });

  it('rejects an email-verification token used as a session', async () => {
    await auth.register('Victim', 'victim@cofre.dev', 'password123');
    const link = new URL(mail.links[0]);
    const token = link.searchParams.get('token')!;

    expect(await authenticate(token)).toBeNull();
  });

  it('rejects a signed payload with no sub', async () => {
    const token = jwt.sign({ email: firstUser.email });
    expect(await authenticate(token)).toBeNull();
  });
});

describe('UsersService.findById', () => {
  it('returns null for a missing id instead of the first user', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      entities: [User],
      synchronize: true,
    });
    await ds.initialize();
    await ds.getRepository(User).save({ email: 'owner@cofre.dev', name: 'Owner' });
    const users = new UsersService(ds.getRepository(User));

    expect(await users.findById(undefined as unknown as string)).toBeNull();
  });
});
