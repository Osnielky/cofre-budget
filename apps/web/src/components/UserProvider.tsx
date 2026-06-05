'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface User { name?: string; email: string }

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

export default function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  function fetchUser() {
    setLoading(true);
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(u => { setUser(u); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { fetchUser(); }, []);

  return (
    <UserContext.Provider value={{ user, loading, clearUser: () => setUser(null), refetch: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}
