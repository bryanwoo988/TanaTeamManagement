import type { EventDoc, Lang } from './types';
import { addDays, minutesOf } from './dates';

const DAY = 24 * 60;
/** The digest job runs every 15 minutes; each run covers the minutes since the previous one. */
const WINDOW = 15;

/** True when digestTime falls in (now-15, now] (KL minutes since midnight), wrapping midnight. */
export function isDue(digestTime: string, nowKlMinutes: number): boolean {
  const ago = (nowKlMinutes - minutesOf(digestTime) + DAY) % DAY;
  return ago < WINDOW;
}

/** The date a due digest is about: the day after the KL day its time fell on (yesterday when the window wrapped midnight). */
export function digestDay(digestTime: string, todayKl: string, nowKlMinutes: number): string {
  return minutesOf(digestTime) > nowKlMinutes ? todayKl : addDays(todayKl, 1);
}

const ALL_DAY: Record<Lang, string> = { zh: '全天', en: 'All day', ms: 'Sepanjang hari' };
const MAX_LINES = 5;

/** One line per event, all-day first then by start time; at most 5 lines, then "+N". */
export function digestBody(events: Pick<EventDoc, 'title' | 'start' | 'allDay' | 'place'>[], lang: Lang): string {
  const key = (e: (typeof events)[number]) => (e.allDay ? '' : e.start || '99:99');
  const sorted = [...events].sort((a, b) => key(a).localeCompare(key(b)) || a.title.localeCompare(b.title));
  const lines = sorted.slice(0, MAX_LINES).map((e) =>
    `${e.allDay ? ALL_DAY[lang] ?? ALL_DAY.en : e.start ?? ''} · ${e.title}${e.place ? ` @ ${e.place}` : ''}`);
  if (sorted.length > MAX_LINES) lines.push(`+${sorted.length - MAX_LINES}`);
  return lines.join('\n');
}
