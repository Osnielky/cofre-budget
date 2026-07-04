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
    description: 'Navy gradient · electric blue · glass cards · neon accents',
    dark: true,
    preview: {
      bg:      '#0B1220',
      surface: 'rgba(15,27,51,0.55)',
      accent:  '#1E90FF',
      accent2: '#A855F7',
      text:    '#E6EDF7',
      textDim: '#94A3B8',
      border:  'rgba(30,144,255,0.16)',
    },
  },
];
