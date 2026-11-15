export type ThemeId = 'classic' | 'paper' | 'mint' | 'lavender' | 'midnight' | 'oled' | 'slate' | 'grape';

export interface ThemeTokens {
  kind: 'light' | 'dark';
  /** Theme names are proper names: shown as-is in every language. */
  label: string;
  bg: string;
  card: string;
  fg: string;
  muted: string;
  line: string;
  soft: string;
  accent: string;
  accentFg: string;
  accentSoft: string;
  /** Six distinct colours for calendar team dots. */
  team: string[];
  /** Status colours; the *Soft fills sit behind normal text (fg), so they must stay readable under it. */
  ok: string; okSoft: string; warn: string; warnSoft: string; err: string; errSoft: string;
}

const LIGHT_TEAM = ['#c2410c', '#15803d', '#1d4ed8', '#a21caf', '#b45309', '#0e7490'];
const DARK_TEAM = ['#f59e0b', '#4ade80', '#60a5fa', '#e879f9', '#fb7185', '#22d3ee'];

const LIGHT_STATUS = { ok: '#2f7d4f', okSoft: '#e1f1e6', warn: '#b7791f', warnSoft: '#faefd6', err: '#b3392f', errSoft: '#f8e0dc' };
const DARK_STATUS = { ok: '#4ade80', okSoft: '#16301f', warn: '#f5b83d', warnSoft: '#37290e', err: '#f87171', errSoft: '#3d1b19' };

export const THEMES: Record<ThemeId, ThemeTokens> = {
  classic: {
    kind: 'light', label: 'Classic',
    bg: '#faf9f7', card: '#ffffff', fg: '#1f1a17', muted: '#6b625c', line: '#e6dfda', soft: '#f3f0ec',
    accent: '#7a5230', accentFg: '#ffffff', accentSoft: '#f1e8df', team: LIGHT_TEAM, ...LIGHT_STATUS,
  },
  paper: {
    kind: 'light', label: 'Paper',
    bg: '#f5f0e8', card: '#fffdf8', fg: '#2b2420', muted: '#6e645b', line: '#e0d8c8', soft: '#eee6d8',
    accent: '#a0582b', accentFg: '#ffffff', accentSoft: '#f3e2d3', team: LIGHT_TEAM, ...LIGHT_STATUS,
  },
  mint: {
    kind: 'light', label: 'Mint',
    bg: '#eef5f1', card: '#fbfefc', fg: '#17231d', muted: '#4f6359', line: '#d3e3da', soft: '#e3eee8',
    accent: '#2f7a5e', accentFg: '#ffffff', accentSoft: '#dcefe6', team: LIGHT_TEAM, ...LIGHT_STATUS,
  },
  lavender: {
    kind: 'light', label: 'Lavender',
    bg: '#f4f2fc', card: '#fdfcff', fg: '#1f1b2e', muted: '#5f5a78', line: '#dcd7ee', soft: '#eae6f7',
    accent: '#5b46c0', accentFg: '#ffffff', accentSoft: '#e6e1f8', team: LIGHT_TEAM, ...LIGHT_STATUS,
  },
  midnight: {
    kind: 'dark', label: 'Midnight',
    bg: '#141516', card: '#1f2022', fg: '#ececec', muted: '#a0a3a8', line: '#333537', soft: '#2a2b2d',
    accent: '#d9a66b', accentFg: '#1a1208', accentSoft: '#3a2f21', team: DARK_TEAM, ...DARK_STATUS,
  },
  oled: {
    kind: 'dark', label: 'OLED Black',
    bg: '#000000', card: '#0d0d0d', fg: '#f2f2f2', muted: '#a3a3a3', line: '#2a2a2a', soft: '#1a1a1a',
    accent: '#d9a66b', accentFg: '#1a1208', accentSoft: '#2e2519', team: DARK_TEAM, ...DARK_STATUS,
  },
  slate: {
    kind: 'dark', label: 'Slate',
    bg: '#22262e', card: '#2d323b', fg: '#e8ecf2', muted: '#a9b3c1', line: '#434a56', soft: '#373d48',
    accent: '#8fb8ea', accentFg: '#0e1a2b', accentSoft: '#2f4058', team: DARK_TEAM, ...DARK_STATUS,
  },
  grape: {
    kind: 'dark', label: 'Grape',
    bg: '#14111c', card: '#211c2e', fg: '#eeeaf6', muted: '#aaa3c0', line: '#3b3350', soft: '#2b2540',
    accent: '#b69cf5', accentFg: '#1a1030', accentSoft: '#35294f', team: DARK_TEAM, ...DARK_STATUS,
  },
};

export const LIGHT_IDS: ThemeId[] = ['classic', 'paper', 'mint', 'lavender'];
export const DARK_IDS: ThemeId[] = ['midnight', 'oled', 'slate', 'grape'];

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
