export type ThemeId = 'tropic' | 'meridian' | 'daylight' | 'linen' | 'creme' | 'noir';

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
    id: 'tropic',
    name: 'Tropic',
    description: 'Dark ocean · gold · emerald',
    dark: true,
    preview: {
      bg:      '#06101E',
      surface: 'rgba(8,22,55,0.60)',
      accent:  '#F5C842',
      accent2: '#22C55E',
      text:    '#F0F4FF',
      textDim: '#8BA3C7',
      border:  'rgba(245,200,66,0.15)',
    },
  },
  {
    id: 'meridian',
    name: 'Meridian',
    description: 'Deep obsidian · teal · amber',
    dark: true,
    preview: {
      bg:      '#030712',
      surface: 'rgba(8,12,34,0.72)',
      accent:  '#2DD4BF',
      accent2: '#FB923C',
      text:    '#F1F5F9',
      textDim: '#94A3B8',
      border:  'rgba(45,212,191,0.18)',
    },
  },
  {
    id: 'daylight',
    name: 'Daylight',
    description: 'Clean white · orange · teal',
    dark: false,
    preview: {
      bg:      '#F5F7FA',
      surface: 'rgba(255,255,255,0.90)',
      accent:  '#F97316',
      accent2: '#0EA5E9',
      text:    '#1E293B',
      textDim: '#64748B',
      border:  'rgba(249,115,22,0.18)',
    },
  },
  {
    id: 'linen',
    name: 'Linen',
    description: 'Warm beige · icy glass · orange',
    dark: false,
    preview: {
      bg:      '#F7F5EF',
      surface: 'rgba(233,243,245,0.78)',
      accent:  '#F3993E',
      accent2: '#4CAF89',
      text:    '#304251',
      textDim: '#6B8FA4',
      border:  'rgba(48,66,81,0.12)',
    },
  },
  {
    id: 'creme',
    name: 'Crème Ledger',
    description: 'Cream paper · espresso · brass',
    dark: false,
    preview: {
      bg:      '#F6F1E7',
      surface: '#FDFBF5',
      accent:  '#B08D3E',
      accent2: '#2E5944',
      text:    '#2B2117',
      textDim: '#6B5D4A',
      border:  '#E3D9C4',
    },
  },
  {
    id: 'noir',
    name: 'Gilded Noir',
    description: 'Midnight navy · champagne gold · glass',
    dark: true,
    preview: {
      bg:      '#0D1526',
      surface: 'rgba(255,255,255,0.07)',
      accent:  '#C9A05C',
      accent2: '#8FBE9B',
      text:    '#F2F1EA',
      textDim: 'rgba(242,241,234,0.66)',
      border:  'rgba(255,255,255,0.14)',
    },
  },
];
