import { useSyncExternalStore } from 'react';
import { THEMES, type ThemeId } from './themes';

export type Mode = 'system' | 'light' | 'dark';
export interface Appearance {
  mode: Mode;
  light: ThemeId;
  dark: ThemeId;
}

const KEY = 'appearance';
const DEFAULTS: Appearance = { mode: 'system', light: 'paper', dark: 'midnight' };
const listeners = new Set<() => void>();
let cache: Appearance | null = null;

function parse(raw: string | null): Appearance {
  if (!raw) return { ...DEFAULTS };
  try {
    const v = JSON.parse(raw) as Partial<Appearance>;
    const mode: Mode = v.mode === 'light' || v.mode === 'dark' || v.mode === 'system' ? v.mode : DEFAULTS.mode;
    const light = v.light && THEMES[v.light]?.kind === 'light' ? v.light : DEFAULTS.light;
    const dark = v.dark && THEMES[v.dark]?.kind === 'dark' ? v.dark : DEFAULTS.dark;
    return { mode, light, dark };
  } catch {
    return { ...DEFAULTS };
  }
}

function read(): Appearance {
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULTS };
  }
}

export function getAppearance(): Appearance {
  // Re-read so external changes (and test resets) are seen; keep the object stable when unchanged.
  const next = read();
  if (!cache || cache.mode !== next.mode || cache.light !== next.light || cache.dark !== next.dark) cache = next;
  return cache;
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

/** Write the active theme's tokens to :root CSS variables and the theme-color meta tag. */
export function applyAppearance(prefersDark: boolean): void {
  if (typeof document === 'undefined') return;
  const a = getAppearance();
  const dark = a.mode === 'dark' || (a.mode === 'system' && prefersDark);
  const th = THEMES[dark ? a.dark : a.light];
  const s = document.documentElement.style;
  const vars: Record<string, string> = {
    bg: th.bg, card: th.card, fg: th.fg, muted: th.muted, line: th.line, soft: th.soft,
    accent: th.accent, 'accent-fg': th.accentFg, 'accent-soft': th.accentSoft,
  };
  for (const [k, v] of Object.entries(vars)) s.setProperty(`--${k}`, v);
  th.team.forEach((c, i) => s.setProperty(`--team-${i + 1}`, c));
  s.setProperty('color-scheme', th.kind);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', th.bg);
}

export function setAppearance(p: Partial<Appearance>): void {
  const next = { ...getAppearance(), ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: choice lasts until reload
  }
  cache = next;
  applyAppearance(systemPrefersDark());
  listeners.forEach((fn) => fn());
}

/** Apply at startup and re-apply when the phone switches between light and dark. */
export function initAppearance(): void {
  applyAppearance(systemPrefersDark());
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => applyAppearance(e.matches));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAppearance(): Appearance & { set: typeof setAppearance } {
  const a = useSyncExternalStore(subscribe, getAppearance, getAppearance);
  return { ...a, set: setAppearance };
}
