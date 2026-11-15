import { useState } from 'react';
import { useT } from '../i18n';
import { MAX_COPY_DATES } from '../../shared/copyDates';
import AsyncButton from '../ui/AsyncButton';
import { toastError } from '../ui/toast';
import { MonthHeader, monthGrid, weekdayNames } from './MonthView';
import { addDays } from '../../shared/dates';
import { useSwipeToClose } from '../ui/useSwipeToClose';

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Pick dates (across months) to copy an event onto. */
export default function CopyDatesSheet({ sourceDate, onCopy, onClose }: {
  sourceDate: string;
  onCopy: (dates: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [month, setMonth] = useState(sourceDate.slice(0, 7));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  function toggle(d: string) {
    setErr(null);
    setPicked((p) => { const n = new Set(p); if (!n.delete(d)) n.add(d); return n; });
  }

  async function go() {
    if (picked.size === 0) return;
    if (picked.size > MAX_COPY_DATES) { setErr(t('cal.tooMany')); throw new Error('tooManyDates'); }
    try {
      await onCopy([...picked].sort());
      onClose();
    } catch (e) { toastError(); throw e; }
  }

  const sheetRef = useSwipeToClose<HTMLDivElement>(onClose);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-label={t('cal.copy')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden />
        <h2 className="sheet-title">{t('cal.pickDates')}</h2>
        <MonthHeader month={month} onMonth={(d) => setMonth((m) => shiftMonth(m, d))} />
        <div role="row" className="cal-dow">{weekdayNames().map((n) => <span key={n} role="columnheader">{n}</span>)}</div>
        <div className="cal-grid">
          {monthGrid(month).map((date, i) => (
            <div key={date ?? `pad${i}`} className="cal-cell">
              {date && (
                <button type="button" aria-label={date} aria-pressed={picked.has(date)} disabled={date === sourceDate}
                  className={'cal-day' + (picked.has(date) ? ' sel' : '')} onClick={() => toggle(date)}>
                  <span aria-hidden>{Number(addDays(date, 0).slice(8))}</span>
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="muted">{t('cal.selected', { n: picked.size })}</p>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="stack">
          <AsyncButton onClick={go} disabled={picked.size === 0}>{t('cal.copyGo')}</AsyncButton>
          <button type="button" className="btn block" onClick={onClose}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  );
}
