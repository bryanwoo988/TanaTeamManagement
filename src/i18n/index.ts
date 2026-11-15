import { useSyncExternalStore } from 'react';
import type { Lang } from '../../shared/types';
import { zh, type MessageKey } from './zh';
import { en } from './en';
import { ms } from './ms';

export type { MessageKey };

const dicts: Record<Lang, Record<MessageKey, string>> = { zh, en, ms };
const htmlLang: Record<Lang, string> = { zh: 'zh-Hans', en: 'en', ms: 'ms' };
const listeners = new Set<() => void>();

/** Map a browser language tag to a supported language; Indonesian maps to Malay, unknown to English. */
export function detectLang(navLang: string): Lang {
  const l = (navLang || '').toLowerCase();
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('ms') || l.startsWith('id')) return 'ms';
  return 'en';
}

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem('lang');
    return v === 'zh' || v === 'en' || v === 'ms' ? v : null;
  } catch {
    return null;
  }
}

let current: Lang =
  readStored() ?? detectLang(typeof navigator !== 'undefined' ? navigator.language : 'en');
if (typeof document !== 'undefined') document.documentElement.lang = htmlLang[current];

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  current = l;
  try {
    localStorage.setItem('lang', l);
  } catch {
    // storage blocked: keep the choice in memory only
  }
  if (typeof document !== 'undefined') document.documentElement.lang = htmlLang[l];
  listeners.forEach((fn) => fn());
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s = dicts[current][key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useT() {
  const lang = useSyncExternalStore(subscribe, getLang);
  return { t, lang, setLang };
}
