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

/* Resolved palette for places that can't use var() — e.g. Recharts SVG attributes. */
export interface ThemeColors {
  primary: string; green: string; rose: string; amber: string;
  orange: string; sky: string; violet: string;
  textPrimary: string; textSecondary: string; textMuted: string;
  border: string; elevated: string;
}

const FALLBACK: ThemeColors = {
  primary: '#F5C842', green: '#22C55E', rose: '#F43F5E', amber: '#FBBF24',
  orange: '#F97316', sky: '#38BDF8', violet: '#818CF8',
  textPrimary: '#F0F4FF', textSecondary: '#8BA3C7', textMuted: '#3D5A80',
  border: 'rgba(255,255,255,0.07)', elevated: 'rgba(12,30,72,0.68)',
};

export function useThemeColors(): ThemeColors {
  const { theme } = useTheme();
  const [colors, setColors] = useState<ThemeColors>(FALLBACK);

  useEffect(() => {
    const s = getComputedStyle(document.documentElement);
    const v = (name: string) => s.getPropertyValue(name).trim();
    setColors({
      primary:       v('--color-primary'),
      green:         v('--color-green'),
      rose:          v('--color-rose'),
      amber:         v('--color-amber'),
      orange:        v('--color-orange'),
      sky:           v('--color-sky'),
      violet:        v('--color-violet'),
      textPrimary:   v('--color-text-primary'),
      textSecondary: v('--color-text-secondary'),
      textMuted:     v('--color-text-muted'),
      border:        v('--color-border'),
      elevated:      v('--color-elevated'),
    });
  }, [theme]);

  return colors;
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
