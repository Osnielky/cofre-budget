'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/components/UserProvider';
import { clearApiCache } from '@/lib/api/cache';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

/** Sign out from anywhere in the shell (sidebar user block, phone More sheet): ends the
    session on the API, then clears the cached user and every cached list so the next
    account never sees this one's data, and goes to the login page. */
export function useLogout() {
  const router = useRouter();
  const { clearUser } = useUser();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // Network error or API down — log out client-side anyway.
    } finally {
      clearUser();
      await clearApiCache();
      router.push('/login');
      setLoggingOut(false);
    }
  }

  return { logout, loggingOut };
}
