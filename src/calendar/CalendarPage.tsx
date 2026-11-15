import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { useTeams } from '../team/TeamContext';
import TeamSwitcher from '../team/TeamSwitcher';
import Bell from '../notify/Bell';
import { useAppearance } from '../theme/appearance';
import { THEMES } from '../theme/themes';
import { useT } from '../i18n';
import { toast, toastError } from '../ui/toast';
import { canEditEvent, isActive } from '../../shared/access';
import { klDate } from '../../shared/dates';
import type { MemberDoc } from '../../shared/types';
import { copyEvent, listEvents, type CalEvent, type Scope } from './data';
import MonthView from './MonthView';
import DayList from './DayList';
import EventEditor, { type EditorLayer, type Person } from './EventEditor';
import CopyDatesSheet from './CopyDatesSheet';

const LAYERS_KEY = 'calLayers';
const scopeOf = (layer: string): Scope => (layer === 'personal' ? 'personal' : { teamId: layer });

/** Ids of layers the user switched off; anything else (including a newly joined team) is shown. */
function readDisabled(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LAYERS_KEY) ?? 'null');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function prefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

type Editing = { event: CalEvent | null };

export default function CalendarPage() {
  const { t } = useT();
  const { user, profile } = useAuth();
  const uid = user?.uid ?? '';
  const { teams, current, member } = useTeams();
  const ap = useAppearance();
  const theme = THEMES[ap.mode === 'dark' || (ap.mode === 'system' && prefersDark()) ? ap.dark : ap.light];

  const today = klDate(new Date());
  // Notification links open /?date=YYYY-MM-DD and /?team=<id>&date=...
  const [params] = useSearchParams();
  const linkDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : null;
  const linkTeam = params.get('team');
  const [month, setMonth] = useState((linkDate ?? today).slice(0, 7));
  const [selected, setSelected] = useState(linkDate ?? today);
  const [disabled, setDisabled] = useState<string[]>(() => { const d = readDisabled(); return linkTeam ? d.filter((x) => x !== linkTeam) : d; });
  const [byLayer, setByLayer] = useState<Record<string, CalEvent[]>>({});
  const [people, setPeople] = useState<Record<string, Person[]>>({});
  const [editing, setEditing] = useState<Editing | null>(null);
  const [copying, setCopying] = useState<CalEvent | null>(null);

  // Layers: personal first, then each team the user is active in (colour by position in the user's team list).
  const teamKey = teams.map((x) => `${x.teamId}|${x.name}|${isActive(x) ? 1 : 0}`).join(',');
  const layers = useMemo(() => {
    const out: { id: string; name: string; color: string }[] = [{ id: 'personal', name: t('team.personal'), color: theme.accent }];
    teams.forEach((x, i) => { if (isActive(x)) out.push({ id: x.teamId, name: x.name, color: theme.team[i % theme.team.length] }); });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamKey, theme, t]);
  const layerKey = layers.map((l) => l.id).join(',');
  const enabled = layers.filter((l) => !disabled.includes(l.id)).map((l) => l.id);

  useEffect(() => {
    const from = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const to = `${month}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`;
    const unsubs = layerKey.split(',').map((id) => listEvents(scopeOf(id), from, to,
      (list) => setByLayer((p) => ({ ...p, [id]: list.map((e) => ({ ...e, layer: id })) })), () => toastError()));
    return () => unsubs.forEach((u) => u());
  }, [month, layerKey]);

  useEffect(() => {
    const unsubs = layerKey.split(',').filter((id) => id !== 'personal').map((id) =>
      onSnapshot(collection(db, 'teams', id, 'members'), (s) => {
        const list = s.docs.map((d) => ({ ...(d.data() as MemberDoc), uid: d.id }));
        setPeople((p) => ({ ...p, [id]: list.filter((m) => m.status === 'active').map((m) => ({ uid: m.uid, name: m.name })) }));
      }, () => {}));
    return () => unsubs.forEach((u) => u());
  }, [layerKey]);

  const colors = useMemo(() => Object.fromEntries(layers.map((l) => [l.id, l.color])), [layers]);
  const layerNames = useMemo(() => Object.fromEntries(layers.map((l) => [l.id, l.name])), [layers]);
  const names = useMemo(() => {
    const n: Record<string, string> = { [uid]: profile?.name ?? '' };
    for (const list of Object.values(people)) for (const p of list) n[p.uid] = p.name;
    return n;
  }, [people, uid, profile?.name]);
  const editorMembers = useMemo(() => ({ ...people, personal: [{ uid, name: profile?.name ?? '' }] }), [people, uid, profile?.name]);

  const known = new Set(layers.map((l) => l.id));
  const visible = enabled.flatMap((id) => byLayer[id] ?? []).filter((e) => known.has(e.layer));
  const dayEvents = visible.filter((e) => e.date === selected);

  function toggleLayer(id: string) {
    const next = disabled.includes(id) ? disabled.filter((x) => x !== id) : [...disabled, id];
    setDisabled(next);
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify(next)); } catch { /* keep in memory only */ }
  }

  function changeMonth(delta: number) {
    const m = shiftMonth(month, delta);
    setMonth(m);
    setSelected(m === today.slice(0, 7) ? today : `${m}-01`);
  }

  const editorLayers: EditorLayer[] = layers.map((l) => ({ id: l.id, name: l.name, admin: l.id !== 'personal' && member(l.id)?.role === 'admin' }));
  const initialLayer = layers.some((l) => l.id === current) ? current : 'personal';
  const overlay = !!editing || !!copying;

  async function doCopy(dates: string[]) {
    if (!copying) return;
    const admin = copying.layer === 'personal' || member(copying.layer)?.role === 'admin';
    // Members may only create events assigned to themselves.
    await copyEvent(scopeOf(copying.layer), admin ? copying : { ...copying, assignees: [uid] }, dates);
    toast({ kind: 'ok', title: t('cal.copied', { n: dates.length }) });
  }

  return (
    <>
      <header className="topbar"><TeamSwitcher /><Bell /></header>
      <main className="stack" aria-hidden={overlay || undefined}>
        <h1>{t('cal.title')}</h1>
        <div className="chips" role="group" aria-label={t('cal.layers')}>
          {layers.map((l) => (
            <button key={l.id} type="button" className="chip" aria-pressed={enabled.includes(l.id)} onClick={() => toggleLayer(l.id)}>
              <i className="dot" style={{ background: l.color }} aria-hidden />{l.name}
            </button>
          ))}
        </div>
        <MonthView month={month} selected={selected} events={visible} colors={colors} onSelect={setSelected} onMonth={changeMonth} />
        <DayList events={dayEvents} names={names} colors={colors} layerNames={layerNames} onOpen={(e) => setEditing({ event: e })} />
        <button type="button" className="btn primary block" onClick={() => setEditing({ event: null })}><Plus size={20} aria-hidden />{t('cal.new')}</button>
      </main>
      {editing && (
        <EventEditor
          key={editing.event ? `${editing.event.layer}/${editing.event.id}` : 'new'}
          event={editing.event} date={selected} layers={editorLayers} initialLayer={initialLayer} members={editorMembers} uid={uid}
          readOnly={!!editing.event && editing.event.layer !== 'personal' && !canEditEvent(member(editing.event.layer), editing.event, uid)}
          onClose={() => setEditing(null)}
          onCopy={(e) => { setEditing(null); setCopying(e); }}
        />
      )}
      {copying && <CopyDatesSheet sourceDate={copying.date} onCopy={doCopy} onClose={() => setCopying(null)} />}
    </>
  );
}
