/* The signed-in user's display fields, remembered in the browser so the shell
   can paint the name, avatar and plan at once instead of a "?" while /auth/me
   answers. Only what the sidebar shows is kept — never isAdmin (the Admin link
   must wait for the server), never emailVerified or anything the server
   decides. Cleared on logout and replaced by every successful fetch. Reads and
   writes never throw: storage can be absent, full or blocked. */

export const USER_CACHE_KEY = 'cofre.user';

export interface CachedUser {
  id?: string;
  name?: string;
  email: string;
  avatarUrl?: string | null;
  plan?: 'free' | 'pro' | 'elite';
  isDemo?: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PLANS = new Set(['free', 'pro', 'elite']);

/** Keeps only the display fields, with the types the sidebar expects. */
export function pickCachedUser(u: unknown): CachedUser | null {
  if (!u || typeof u !== 'object') return null;
  const o = u as Record<string, unknown>;
  if (typeof o.email !== 'string' || !o.email) return null;
  const out: CachedUser = { email: o.email };
  if (typeof o.id === 'string') out.id = o.id;
  if (typeof o.name === 'string') out.name = o.name;
  if (typeof o.avatarUrl === 'string' || o.avatarUrl === null) out.avatarUrl = o.avatarUrl as string | null;
  if (typeof o.plan === 'string' && PLANS.has(o.plan)) out.plan = o.plan as CachedUser['plan'];
  if (o.isDemo === true) out.isDemo = true;
  return out;
}

export function readCachedUser(storage: StorageLike | null | undefined): CachedUser | null {
  try {
    const raw = storage?.getItem(USER_CACHE_KEY);
    return raw ? pickCachedUser(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeCachedUser(storage: StorageLike | null | undefined, user: unknown): void {
  try {
    const picked = pickCachedUser(user);
    if (picked) storage?.setItem(USER_CACHE_KEY, JSON.stringify(picked));
    else storage?.removeItem(USER_CACHE_KEY);
  } catch {
    /* storage unavailable: the shell falls back to the fetched user */
  }
}
