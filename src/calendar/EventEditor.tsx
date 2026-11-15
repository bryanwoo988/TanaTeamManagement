import { useState } from 'react';
import { useT } from '../i18n';
import { minutesOf } from '../../shared/dates';
import AsyncButton from '../ui/AsyncButton';
import { confirmSheet } from '../ui/confirm';
import { toast, toastError } from '../ui/toast';
import { deleteEvent, saveEvent, type CalEvent, type Scope } from './data';
import { useSwipeToClose } from '../ui/useSwipeToClose';

export interface EditorLayer { id: string; name: string; admin: boolean }
export interface Person { uid: string; name: string }

const scopeOf = (layer: string): Scope => (layer === 'personal' ? 'personal' : { teamId: layer });

/** Create, edit (or just view) one event. Rules: admins pick assignees; members are locked to themselves. */
export default function EventEditor({ event, date, layers, initialLayer, members, uid, readOnly, onClose, onCopy }: {
  event: CalEvent | null;
  date: string;
  /** Calendars the user may create events in (editing an existing event uses its own layer). */
  layers: EditorLayer[];
  initialLayer: string;
  members: Record<string, Person[]>;
  uid: string;
  readOnly: boolean;
  onClose: () => void;
  onCopy: (e: CalEvent) => void;
}) {
  const { t } = useT();
  const [layer, setLayer] = useState(event?.layer ?? initialLayer);
  const [title, setTitle] = useState(event?.title ?? '');
  const [day, setDay] = useState(event?.date ?? date);
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [start, setStart] = useState(event?.start ?? '');
  const [end, setEnd] = useState(event?.end ?? '');
  const [place, setPlace] = useState(event?.place ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [assignees, setAssignees] = useState<string[]>(event?.assignees ?? [uid]);
  const [err, setErr] = useState<string | null>(null);

  const info = layers.find((l) => l.id === layer);
  const isTeam = layer !== 'personal';
  const canPick = !readOnly && isTeam && !!info?.admin;
  const people = members[layer] ?? [];

  function fail(msg: string): never {
    setErr(msg);
    throw new Error(msg);
  }

  async function save() {
    setErr(null);
    if (!title.trim()) fail(t('cal.titleRequired'));
    if (!allDay && start && end && minutesOf(end) < minutesOf(start)) fail(t('cal.endBeforeStart'));
    try {
      await saveEvent(scopeOf(layer), event?.id ?? null, {
        title: title.trim(), date: day, allDay, ...(allDay ? {} : { start: start || undefined, end: end || undefined }),
        assignees: isTeam ? assignees : [uid], place: place.trim(), notes: notes.trim(),
      });
    } catch (e) { toastError(); throw e; }
    toast({ kind: 'ok', title: t('cal.saved') });
    onClose();
  }

  async function remove() {
    if (!event) return;
    if (!(await confirmSheet({ title: t('cal.deleteTitle'), body: event.title, confirmLabel: t('delete'), danger: true }))) throw new Error('cancelled');
    try { await deleteEvent(scopeOf(event.layer), event.id); } catch (e) { toastError(); throw e; }
    toast({ kind: 'ok', title: t('cal.deleted') });
    onClose();
  }

  function toggle(u: string) {
    setAssignees((a) => (a.includes(u) ? a.filter((x) => x !== u) : [...a, u]));
  }

  const sheetRef = useSwipeToClose<HTMLDivElement>(onClose);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-label={event ? t('cal.edit') : t('cal.new')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden />
        <h2 className="sheet-title">{event ? t('cal.edit') : t('cal.new')}</h2>
        {readOnly && <p className="muted">{t('cal.readOnly')}</p>}
        <div className="stack">
          {!event && layers.length > 1 && (
            <label>{t('cal.calendar')}
              <select value={layer} onChange={(e) => { setLayer(e.target.value); setAssignees([uid]); }}>
                {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}
          <label>{t('cal.eventTitle')}<input value={title} maxLength={120} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>{t('cal.date')}<input type="date" value={day} disabled={readOnly} onChange={(e) => setDay(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={allDay} disabled={readOnly} onChange={(e) => setAllDay(e.target.checked)} />{t('cal.allDay')}</label>
          {!allDay && (
            <>
              <label>{t('cal.start')}<input type="time" value={start} disabled={readOnly} onChange={(e) => setStart(e.target.value)} /></label>
              <label>{t('cal.end')}<input type="time" value={end} disabled={readOnly} onChange={(e) => setEnd(e.target.value)} /></label>
            </>
          )}
          <label>{t('cal.place')}<input value={place} disabled={readOnly} onChange={(e) => setPlace(e.target.value)} /></label>
          <label>{t('cal.notes')}<textarea value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} /></label>
          {isTeam && (
            <fieldset>
              <legend>{t('cal.assignees')}</legend>
              {people.map((p) => (
                <label key={p.uid} className="check">
                  <input type="checkbox" checked={assignees.includes(p.uid)} disabled={!canPick} onChange={() => toggle(p.uid)} />{p.name}
                </label>
              ))}
            </fieldset>
          )}
          {err && <p className="err" role="alert">{err}</p>}
          {!readOnly && <AsyncButton onClick={save}>{t('save')}</AsyncButton>}
          {!readOnly && event && <button type="button" className="btn block" onClick={() => onCopy(event)}>{t('cal.copy')}</button>}
          {!readOnly && event && <AsyncButton className="btn danger block" onClick={remove}>{t('delete')}</AsyncButton>}
          <button type="button" className="btn block" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}
