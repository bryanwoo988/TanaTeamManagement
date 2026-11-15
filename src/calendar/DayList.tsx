import { useT } from '../i18n';
import { minutesOf } from '../../shared/dates';
import type { CalEvent } from './data';

function order(a: CalEvent, b: CalEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const am = a.start ? minutesOf(a.start) : -1;
  const bm = b.start ? minutesOf(b.start) : -1;
  return am - bm || a.title.localeCompare(b.title);
}

export default function DayList({ events, names, colors, layerNames, onOpen }: {
  events: CalEvent[];
  names: Record<string, string>;
  colors: Record<string, string>;
  layerNames: Record<string, string>;
  onOpen: (e: CalEvent) => void;
}) {
  const { t } = useT();
  if (events.length === 0) return <p className="muted">{t('cal.empty')}</p>;
  return (
    <ul className="plain-list ev-list" aria-label={t('cal.events')}>
      {[...events].sort(order).map((e) => {
        const when = e.allDay ? t('cal.allDay') : e.start ? (e.end ? `${e.start}–${e.end}` : e.start) : '';
        const who = e.assignees.map((u) => names[u] ?? '…').join(', ');
        return (
          <li key={`${e.layer}/${e.id}`}>
            <button type="button" className="ev" onClick={() => onOpen(e)}>
              <i className="dot" style={{ background: colors[e.layer] }} aria-hidden />
              <span className="ev-body">
                <span className="ev-title">{e.title}</span>
                <span className="muted small">{[when, who, layerNames[e.layer], e.place].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
