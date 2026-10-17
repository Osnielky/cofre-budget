import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';

const HOUR = 60 * 60 * 1000;
let ds: DataSource;
let users: UsersService;
let user: User;

beforeEach(async () => {
  ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', dropSchema: true, synchronize: true, entities: [User] });
  await ds.initialize();
  users = new UsersService(ds.getRepository(User));
  user = await ds.getRepository(User).save({ email: 'a@cofre.dev', name: 'A' });
});

const reload = () => ds.getRepository(User).findOneByOrFail({ id: user.id });

describe('UsersService.touchLastSeen', () => {
  it('sets lastSeenAt when it was never set', async () => {
    const now = new Date('2026-10-13T12:00:00Z');
    await users.touchLastSeen(user.id, now);
    expect((await reload()).lastSeenAt?.getTime()).toBe(now.getTime());
  });

  it('skips the write when the last touch is under an hour old', async () => {
    const first = new Date('2026-10-13T12:00:00Z');
    await users.touchLastSeen(user.id, first);
    await users.touchLastSeen(user.id, new Date(first.getTime() + HOUR - 1000));
    expect((await reload()).lastSeenAt?.getTime()).toBe(first.getTime());
  });

  it('writes again once the last touch is over an hour old', async () => {
    const first = new Date('2026-10-13T12:00:00Z');
    const later = new Date(first.getTime() + HOUR + 1000);
    await users.touchLastSeen(user.id, first);
    await users.touchLastSeen(user.id, later);
    expect((await reload()).lastSeenAt?.getTime()).toBe(later.getTime());
  });

  it('does not change updatedAt', async () => {
    const before = (await reload()).updatedAt.getTime();
    await users.touchLastSeen(user.id, new Date('2030-01-01T00:00:00Z'));
    expect((await reload()).updatedAt.getTime()).toBe(before);
  });

  it('never rejects, even when the database fails', async () => {
    await ds.destroy();
    await expect(users.touchLastSeen(user.id)).resolves.toBeUndefined();
  });
});
