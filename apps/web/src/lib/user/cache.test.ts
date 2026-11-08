import { describe, it, expect } from 'vitest';
import { pickCachedUser, readCachedUser, writeCachedUser, USER_CACHE_KEY, type StorageLike } from './cache';

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

describe('user display cache', () => {
  it('round-trips the display fields and drops everything else', () => {
    const s = memoryStorage();
    writeCachedUser(s, { id: 'u1', name: 'Rockefeller', email: 'r@demo.cofre', avatarUrl: null, plan: 'pro', isDemo: false, isAdmin: true, emailVerified: true, createdAt: '2026-01-01' });
    expect(readCachedUser(s)).toEqual({ id: 'u1', name: 'Rockefeller', email: 'r@demo.cofre', avatarUrl: null, plan: 'pro' });
    expect(JSON.parse(s.map.get(USER_CACHE_KEY)!)).not.toHaveProperty('isAdmin');
  });

  it('keeps the demo flag only when true', () => {
    expect(pickCachedUser({ email: 'a@b.c', isDemo: true })).toEqual({ email: 'a@b.c', isDemo: true });
    expect(pickCachedUser({ email: 'a@b.c', isDemo: false })).toEqual({ email: 'a@b.c' });
  });

  it('writing null removes the entry (logout)', () => {
    const s = memoryStorage();
    writeCachedUser(s, { email: 'a@b.c' });
    writeCachedUser(s, null);
    expect(s.map.has(USER_CACHE_KEY)).toBe(false);
    expect(readCachedUser(s)).toBeNull();
  });

  it('rejects malformed entries instead of throwing', () => {
    const s = memoryStorage();
    s.map.set(USER_CACHE_KEY, '{not json');
    expect(readCachedUser(s)).toBeNull();
    s.map.set(USER_CACHE_KEY, JSON.stringify({ name: 'no email' }));
    expect(readCachedUser(s)).toBeNull();
    s.map.set(USER_CACHE_KEY, JSON.stringify({ email: 'a@b.c', plan: 'platinum' }));
    expect(readCachedUser(s)).toEqual({ email: 'a@b.c' });
  });

  it('survives a storage that throws or is missing', () => {
    const broken: StorageLike = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(readCachedUser(broken)).toBeNull();
    expect(() => writeCachedUser(broken, { email: 'a@b.c' })).not.toThrow();
    expect(readCachedUser(undefined)).toBeNull();
    expect(() => writeCachedUser(null, null)).not.toThrow();
  });
});
