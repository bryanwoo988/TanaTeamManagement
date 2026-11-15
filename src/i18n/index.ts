import { useSyncExternalStore } from 'react';
import type { Lang } from '../../shared/types';
import { zh, type MessageKey } from './zh';
import { en } from './en';
import { ms } from './ms';

export type { MessageKey };

const dicts: Record<Lang, Record<MessageKey, string>> = { zh, en, ms };
const htmlLang: Record<Lang, string> = { zh: 'zh-Hans', en: 'en', ms: 'ms' };
const listeners = new Set<() => void>();

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem('lang');
    return v === 'zh' || v === 'en' || v === 'ms' ? v : null;
  } catch {
    return null;
  }
}

const stored = readStored();
// English until the person picks a language; first-time visitors are asked (FirstRunGate).
let current: Lang = stored ?? 'en';
let chosen = stored !== null;
if (typeof document !== 'undefined') document.documentElement.lang = htmlLang[current];

export function getLang(): Lang {
  return current;
}

export function hasChosenLang(): boolean {
  return chosen;
}

export function setLang(l: Lang): void {
  current = l;
  chosen = true;
  try {
    localStorage.setItem('lang', l);
  } catch {
    // storage blocked: keep the choice in memory only
  }
  if (typeof document !== 'undefined') document.documentElement.lang = htmlLang[l];
  listeners.forEach((fn) => fn());
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const s = dicts[current][key] ?? key;
  // One pass, so a substituted value that contains braces is never expanded again.
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useT() {
  const lang = useSyncExternalStore(subscribe, getLang);
  return { t, lang, setLang };
}

/** True once the person has picked a language (re-renders when they do). */
export function useLangChosen(): boolean {
  return useSyncExternalStore(subscribe, hasChosenLang);
}
