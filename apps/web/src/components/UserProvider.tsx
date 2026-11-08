'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { clearApiCache } from '@/lib/api/cache';
import { readCachedUser, writeCachedUser } from '@/lib/user/cache';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface User {
  id?: string;
  name?: string;
  email: string;
  avatarUrl?: string | null;
  googleId?: string | null;
  plan?: 'free' | 'pro' | 'elite';
  emailVerified?: boolean;
  createdAt?: string;
  isAdmin?: boolean;
  /** Public demo sandbox: discarded on logout; bank linking, billing and account changes are blocked. */
  isDemo?: boolean;
}

export type { User };

interface UserContextValue {
  user:      User | null;
  loading:   boolean;
  clearUser: () => void;
  refetch:   () => void;
}

const UserContext = createContext<UserContextValue>({
  user: null, loading: true, clearUser: () => {}, refetch: () => {},
});

export function useUser() {
  return useContext(UserContext);
}

function storage(): Storage | undefined {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

export default function UserProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Signed-in users never render `/` (middleware redirects them to /dashboard),
  // so an anonymous homepage visit has no session to fetch — skip the call.
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(pathname !== '/');

  function fetchUser() {
    setLoading(true);
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(u => { setUser(u); writeCachedUser(storage(), u); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (pathname === '/') {
      setLoading(false);
      return;
    }
    /* Paint the last known name, avatar and plan at once (lib/user/cache keeps
       only display fields), then confirm with the server. `loading` stays true
       until /auth/me answers, so nothing that gates on it trusts the cache. */
    const cached = readCachedUser(storage());
    if (cached) setUser((current) => current ?? cached);
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearUser() {
    setUser(null);
    writeCachedUser(storage(), null);
    void clearApiCache();
  }

  return (
    <UserContext.Provider value={{ user, loading, clearUser, refetch: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}
