'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { THEMES, type ThemeId } from '@/lib/theme';

const STORAGE_KEY = 'cofre-theme';
const DEFAULT_THEME: ThemeId = 'cobalt';

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
  primary: '#3B82F6', green: '#22C55E', rose: '#EF4444', amber: '#FBBF24',
  orange: '#F97316', sky: '#38BDF8', violet: '#8B5CF6',
  textPrimary: '#F1F5F9', textSecondary: '#94A3B8', textMuted: '#5B6B84',
  border: 'rgba(148,163,184,0.10)', elevated: '#101A2E',
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

  /* Read saved preference on mount (client-only).
     Saved ids from removed themes fall back to the default. */
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    applyTheme(THEMES.some((t) => t.id === saved) ? (saved as ThemeId) : DEFAULT_THEME);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
