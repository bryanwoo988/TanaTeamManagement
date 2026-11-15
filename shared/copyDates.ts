import type { EventDoc } from './types';

export const MAX_COPY_DATES = 60;

/** Copy an event to other dates: source date skipped, duplicates removed, sorted ascending. */
export function copyEventToDates(e: EventDoc, dates: string[]): EventDoc[] {
  const unique = [...new Set(dates)].filter((d) => d !== e.date).sort();
  if (unique.length > MAX_COPY_DATES) throw new Error('tooManyDates');
  return unique.map((date) => ({ ...e, assignees: [...e.assignees], date }));
}
