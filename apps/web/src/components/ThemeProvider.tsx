'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ThemeId } from '@/lib/theme';

const STORAGE_KEY = 'cofre-theme';
const DEFAULT_THEME: ThemeId = 'tropic';

interface ThemeContextValue {
  theme:    ThemeId;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:    DEFAULT_THEME,
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  /* Read saved preference on mount (client-only) */
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (saved) applyTheme(saved);
  }, []);

  function applyTheme(id: ThemeId) {
    document.documentElement.setAttribute('data-theme', id);
    localStorage.setItem(STORAGE_KEY, id);
    setThemeState(id);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme: applyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
