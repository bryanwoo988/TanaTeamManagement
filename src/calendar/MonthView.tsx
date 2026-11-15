import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays } from '../../shared/dates';
import { getLang, useT } from '../i18n';
import type { CalEvent } from './data';

const LOCALE = { zh: 'zh-CN', en: 'en', ms: 'ms-MY' } as const;

/** Monday-first weekday short names, e.g. Mon..Sun. */
export function weekdayNames(): string[] {
  const f = new Intl.DateTimeFormat(LOCALE[getLang()], { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2026, 10, 2 + i)))); // 2 Nov 2026 is a Monday
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE[getLang()], { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Days of a month as a Monday-aligned grid: null pads, whole weeks. */
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 0; d < count; d++) cells.push(addDays(first, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function MonthHeader({ month, onMonth }: { month: string; onMonth: (delta: number) => void }) {
  const { t } = useT();
  return (
    <div className="cal-head">
      <button type="button" className="icon-btn" aria-label={t('cal.prev')} onClick={() => onMonth(-1)}><ChevronLeft size={20} aria-hidden /></button>
      <strong>{monthLabel(month)}</strong>
      <button type="button" className="icon-btn" aria-label={t('cal.next')} onClick={() => onMonth(1)}><ChevronRight size={20} aria-hidden /></button>
    </div>
  );
}

export default function MonthView({ month, selected, events, colors, onSelect, onMonth }: {
  month: string;
  selected: string;
  events: CalEvent[];
  /** Layer id -> dot colour. */
  colors: Record<string, string>;
  onSelect: (date: string) => void;
  onMonth: (delta: number) => void;
}) {
  const layersByDay = new Map<string, string[]>();
  for (const e of events) {
    const l = layersByDay.get(e.date) ?? [];
    if (!l.includes(e.layer)) l.push(e.layer);
    layersByDay.set(e.date, l);
  }
  return (
    <section className="cal-month">
      <MonthHeader month={month} onMonth={onMonth} />
      <div role="row" className="cal-dow">
        {weekdayNames().map((n) => <span key={n} role="columnheader">{n}</span>)}
      </div>
      <div className="cal-grid" data-testid="cal-grid">
        {monthGrid(month).map((date, i) => (
          <div key={date ?? `pad${i}`} className="cal-cell">
            {date && (
              <button type="button" aria-label={date} aria-pressed={date === selected} className={'cal-day' + (date === selected ? ' sel' : '')} onClick={() => onSelect(date)}>
                <span aria-hidden>{Number(date.slice(8))}</span>
                <span className="dots" aria-hidden>
                  {(layersByDay.get(date) ?? []).map((l) => <i key={l} className="dot" style={{ background: colors[l] }} />)}
                </span>
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
