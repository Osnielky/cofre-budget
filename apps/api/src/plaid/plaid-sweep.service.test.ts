import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { PlaidItem } from './plaid-item.entity';
import { User } from '../users/user.entity';
import { PlaidSweepService, STALE_AFTER_MS } from './plaid-sweep.service';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [PlaidItem, User],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

const NOW = new Date('2026-10-28T09:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

describe('PlaidSweepService', () => {
  let ds: DataSource;
  let synced: string[];
  let service: PlaidSweepService;

  async function seedItem(itemId: string, lastSync: Date | null, status = 'active') {
    await ds.getRepository(PlaidItem).save(ds.getRepository(PlaidItem).create({
      userId: 'user-1', itemId, institutionId: 'inst', institutionName: 'Bank', accessToken: 'enc', status,
      lastSync: lastSync as any,
    }));
  }

  beforeEach(async () => {
    ds = await makeDataSource();
    await ds.getRepository(User).save(ds.getRepository(User).create({ id: 'user-1', email: 'user-1@example.com' }));
    synced = [];
    const plaid = { syncByExternalItemId: vi.fn(async (id: string) => { synced.push(id); }) };
    const config = { get: () => undefined };
    service = new PlaidSweepService(ds.getRepository(PlaidItem), plaid as any, config as any);
  });

  it('syncs items never synced or older than 24 hours, oldest first', async () => {
    await seedItem('fresh', hoursAgo(2));
    await seedItem('old', hoursAgo(30));
    await seedItem('never', null);
    await seedItem('older', hoursAgo(72));

    const result = await service.sweepStale(NOW);

    expect(synced).toEqual(['never', 'older', 'old']);
    expect(result).toEqual({ stale: 3, synced: 3, failed: 0, skipped: 0 });
  });

  it('leaves items that need a reconnect alone', async () => {
    await seedItem('broken', hoursAgo(100), 'error');
    const result = await service.sweepStale(NOW);
    expect(synced).toEqual([]);
    expect(result.stale).toBe(0);
  });

  it('treats exactly 24 hours as the boundary', async () => {
    await seedItem('edge', new Date(NOW.getTime() - STALE_AFTER_MS + 1000));
    expect((await service.sweepStale(NOW)).stale).toBe(0);
    await seedItem('past', new Date(NOW.getTime() - STALE_AFTER_MS - 1000));
    expect((await service.sweepStale(NOW)).stale).toBe(1);
  });

  it('counts a failing item and keeps going', async () => {
    await seedItem('bad', hoursAgo(30));
    await seedItem('good', hoursAgo(31));
    const plaid = {
      syncByExternalItemId: vi.fn(async (id: string) => {
        if (id === 'bad') throw new Error('decrypt failed');
        synced.push(id);
      }),
    };
    service = new PlaidSweepService(ds.getRepository(PlaidItem), plaid as any, { get: () => undefined } as any);

    const result = await service.sweepStale(NOW);

    expect(synced).toEqual(['good']);
    expect(result).toMatchObject({ stale: 2, synced: 1, failed: 1 });
  });

  it('skips an item another trigger refreshed while the sweep was running', async () => {
    await seedItem('a', hoursAgo(30));
    await seedItem('b', hoursAgo(40));
    const repo = ds.getRepository(PlaidItem);
    const plaid = {
      syncByExternalItemId: vi.fn(async (id: string) => {
        synced.push(id);
        // A webhook lands for "a" while "b" is syncing.
        if (id === 'b') await repo.update({ itemId: 'a' }, { lastSync: NOW });
      }),
    };
    service = new PlaidSweepService(repo, plaid as any, { get: () => undefined } as any);

    const result = await service.sweepStale(NOW);

    expect(synced).toEqual(['b']);
    expect(result).toEqual({ stale: 2, synced: 1, failed: 0, skipped: 1 });
  });

  it('does not start a second sweep while one is running', async () => {
    await seedItem('slow', hoursAgo(30));
    let release!: () => void;
    const plaid = {
      syncByExternalItemId: vi.fn(() => new Promise<void>((resolve) => { release = resolve; })),
    };
    service = new PlaidSweepService(ds.getRepository(PlaidItem), plaid as any, { get: () => undefined } as any);

    const first = service.sweepStale(NOW);
    await new Promise((r) => setTimeout(r, 10));
    const second = await service.sweepStale(NOW);
    expect(second).toEqual({ stale: 0, synced: 0, failed: 0, skipped: 0 });
    release();
    expect((await first).synced).toBe(1);
  });
});
