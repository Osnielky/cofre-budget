import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { User } from './user.entity';
import { UsersService, USER_CACHE_TTL_MS } from './users.service';

let ds: DataSource;
let service: UsersService;
let id: string;

beforeEach(async () => {
  ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', dropSchema: true, entities: [User], synchronize: true });
  await ds.initialize();
  service = new UsersService(ds.getRepository(User));
  const users = ds.getRepository(User);
  id = (await users.save(users.create({ email: 'cache@test.cofre', name: 'Before', plan: 'free' } as Partial<User>))).id;
});

describe('UsersService.findByIdCached', () => {
  it('hits the database once within the TTL', async () => {
    const find = vi.spyOn(service, 'findById');
    const t0 = 1_000_000;
    expect((await service.findByIdCached(id, t0))?.name).toBe('Before');
    expect((await service.findByIdCached(id, t0 + 1_000))?.name).toBe('Before');
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('reads again once the TTL has passed', async () => {
    const find = vi.spyOn(service, 'findById');
    const t0 = 1_000_000;
    await service.findByIdCached(id, t0);
    await ds.getRepository(User).update(id, { name: 'After' });
    expect((await service.findByIdCached(id, t0 + USER_CACHE_TTL_MS - 1))?.name).toBe('Before');
    expect((await service.findByIdCached(id, t0 + USER_CACHE_TTL_MS + 1))?.name).toBe('After');
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('a write through the service is visible on the next read', async () => {
    const t0 = 1_000_000;
    await service.findByIdCached(id, t0);
    await service.updateProfile(id, { name: 'Renamed' });
    expect((await service.findByIdCached(id, t0 + 1))?.name).toBe('Renamed');
  });

  it('never caches a miss, and rejects an empty id without a query', async () => {
    const find = vi.spyOn(service, 'findById');
    expect(await service.findByIdCached('')).toBeNull();
    expect(find).not.toHaveBeenCalled();
    expect(await service.findByIdCached('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(await service.findByIdCached('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(find).toHaveBeenCalledTimes(2);
  });
});
