import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from './user.entity';
import { UsersService } from './users.service';
import { GoogleStrategy } from '../auth/strategies/google.strategy';

let ds: DataSource;
let users: UsersService;

beforeEach(async () => {
  ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', dropSchema: true, synchronize: true, entities: [User] });
  await ds.initialize();
  users = new UsersService(ds.getRepository(User));
});

const withPassword = async (email: string, emailVerified: boolean) =>
  ds.getRepository(User).save({ email, name: 'Registered Name', password: 'attacker-or-owner-hash', emailVerified });

const passwordOf = async (id: string) =>
  (await ds.getRepository(User).createQueryBuilder('u').addSelect('u.password').where('u.id = :id', { id }).getOneOrFail()).password;

describe('findOrCreateByGoogle', () => {
  // Anyone can register victim@gmail.com with their own password; login stays
  // blocked until the email is verified. If the real owner later signs in with
  // Google, linking must not keep that unproven password working.
  it('drops the password of an unverified account it links to', async () => {
    const squatted = await withPassword('victim@gmail.com', false);
    const user = await users.findOrCreateByGoogle({ id: 'g-1', email: 'victim@gmail.com', name: 'Real Victim' });

    expect(user.id).toBe(squatted.id);
    expect(user).toMatchObject({ googleId: 'g-1', emailVerified: true, name: 'Real Victim' });
    expect(await passwordOf(squatted.id)).toBeNull();
  });

  it('keeps the password of a verified account it links to', async () => {
    const owner = await withPassword('owner@gmail.com', true);
    await users.findOrCreateByGoogle({ id: 'g-2', email: 'owner@gmail.com', name: 'Owner' });

    expect(await passwordOf(owner.id)).toBe('attacker-or-owner-hash');
    expect((await ds.getRepository(User).findOneByOrFail({ id: owner.id })).name).toBe('Registered Name');
  });
});

describe('GoogleStrategy.validate', () => {
  const config = { get: (_k: string, d?: string) => d ?? 'x' } as unknown as ConfigService;
  const run = (profile: any) =>
    new Promise<{ err: unknown; user: unknown }>((resolve) => {
      const strategy = new GoogleStrategy(config, users);
      strategy.validate('at', 'rt', profile, (err, user) => resolve({ err, user }));
    });

  it('refuses an email Google has not verified', async () => {
    const { user } = await run({ id: 'g-3', displayName: 'X', emails: [{ value: 'someone@example.com', verified: false }] });
    expect(user).toBeFalsy();
    expect(await ds.getRepository(User).countBy({ email: 'someone@example.com' })).toBe(0);
  });

  it('refuses a profile with no email', async () => {
    const { user } = await run({ id: 'g-4', displayName: 'X', emails: [] });
    expect(user).toBeFalsy();
  });

  it('signs in a verified Google email', async () => {
    const { err, user } = await run({ id: 'g-5', displayName: 'Ok', emails: [{ value: 'ok@example.com', verified: true }] });
    expect(err).toBeNull();
    expect((user as User).email).toBe('ok@example.com');
  });
});

describe('GoogleCallbackGuard', () => {
  it('lets a refused sign-in through with no user so the callback can redirect to /login', async () => {
    const { GoogleCallbackGuard } = await import('../auth/guards/google-callback.guard');
    const guard = new GoogleCallbackGuard();
    expect(guard.handleRequest(null, false)).toBeNull();
    expect(() => guard.handleRequest(new Error('google down'), false)).toThrow('google down');
  });
});
