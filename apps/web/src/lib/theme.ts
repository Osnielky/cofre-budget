/* Theme registry.
 *
 * Adding a theme:
 *  1. Add its id to ThemeId and an entry to THEMES (the appearance
 *     settings tab renders this array automatically).
 *  2. Add an `html[data-theme="<id>"]` variable-override block in
 *     src/app/globals.css. Components only consume CSS variables,
 *     so no component changes are ever needed.
 *
 * `dark` tells the picker and any future surface which family a theme belongs
 * to. A light theme must also set `color-scheme: light` in its CSS block and
 * supply its own (darker) chart palette — see the Daylight block for why.
 */
export type ThemeId = 'cobalt' | 'noir-gold' | 'aurora' | 'daylight';

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
      bg:      '#0A1222',
      surface: 'rgba(18,32,60,0.62)',
      accent:  '#1E90FF',
      accent2: '#A855F7',
      text:    '#EAF0FA',
      textDim: '#A6B6D2',
      border:  'rgba(77,166,255,0.18)',
    },
  },
  {
    id: 'noir-gold',
    name: 'Noir Gold',
    description: 'Charcoal base · warm gold accent · quiet luxury',
    dark: true,
    preview: {
      bg:      '#0D0D10',
      surface: 'rgba(26,26,32,0.74)',
      accent:  '#E0B45A',
      accent2: '#A855F7',
      text:    '#F3EFE6',
      textDim: '#B9B2A4',
      border:  'rgba(224,180,90,0.18)',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Deep teal · mint accent · calm and fresh',
    dark: true,
    preview: {
      bg:      '#071512',
      surface: 'rgba(14,36,33,0.66)',
      accent:  '#34D399',
      accent2: '#A855F7',
      text:    '#E9F5F1',
      textDim: '#A3BFB6',
      border:  'rgba(52,211,153,0.18)',
    },
  },
  {
    id: 'daylight',
    name: 'Daylight',
    description: 'Soft white · blue accent · for bright rooms',
    dark: false,
    preview: {
      bg:      '#F3F5FA',
      surface: 'rgba(255,255,255,0.90)',
      accent:  '#2563EB',
      accent2: '#7C3AED',
      text:    '#0F172A',
      textDim: '#64748B',
      border:  'rgba(37,99,235,0.18)',
    },
  },
];
