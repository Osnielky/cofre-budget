/* Theme registry.
 *
 * Adding a theme:
 *  1. Add its id to ThemeId and an entry to THEMES (the appearance
 *     settings tab renders this array automatically).
 *  2. Add an `html[data-theme="<id>"]` variable-override block in
 *     src/app/globals.css. Components only consume CSS variables,
 *     so no component changes are ever needed.
 */
export type ThemeId = 'cobalt';

export interface Theme {
  id:          ThemeId;
  name:        string;
  description: string;
  dark:        boolean;
  preview: {
    bg:      string;
    surface: string;
    accent:  string;
    accent2: string;
    text:    string;
    textDim: string;
    border:  string;
  };
}

export const THEMES: Theme[] = [
  {
    id: 'cobalt',
    name: 'Cobalt',
    description: 'Deep navy · electric blue · vivid data colors',
    dark: true,
    preview: {
      bg:      '#060B16',
      surface: '#0A101E',
      accent:  '#3B82F6',
      accent2: '#8B5CF6',
      text:    '#F1F5F9',
      textDim: '#94A3B8',
      border:  'rgba(148,163,184,0.10)',
    },
  },
];
