import { addDoc, collection, deleteDoc, deleteField, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { copyEventToDates } from '../../shared/copyDates';
import type { EventDoc } from '../../shared/types';

/** A team's shared calendar, or the signed-in user's personal one. */
export type Scope = { teamId: string } | 'personal';
/** What the editor produces: everything except the fields the data layer owns. */
export type EventInput = Omit<EventDoc, 'createdBy' | 'updatedAt' | 'batchId'>;
/** An event as shown on the calendar, tagged with the layer it came from. */
export type CalEvent = EventDoc & { id: string; layer: string };

function uidOf(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('not signed in');
  return uid;
}

const eventsRef = (scope: Scope, uid: string) =>
  scope === 'personal' ? collection(db, 'users', uid, 'events') : collection(db, 'teams', scope.teamId, 'events');

const eventRef = (scope: Scope, uid: string, id: string) =>
  scope === 'personal' ? doc(db, 'users', uid, 'events', id) : doc(db, 'teams', scope.teamId, 'events', id);

/** Events with from <= date <= to (YYYY-MM-DD, inclusive). */
export async function listEvents(scope: Scope, from: string, to: string): Promise<(EventDoc & { id: string })[]> {
  const q = query(eventsRef(scope, uidOf()), where('date', '>=', from), where('date', '<=', to));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as EventDoc), id: d.id }));
}

function fields(scope: Scope, uid: string, e: EventInput) {
  const out: Record<string, unknown> = { title: e.title, date: e.date, allDay: e.allDay, assignees: scope === 'personal' ? [uid] : e.assignees, place: e.place, notes: e.notes };
  return out;
}

/** Create (id null) or update an event. Always stamps updatedAt; create also sets createdBy. */
export async function saveEvent(scope: Scope, id: string | null, e: EventInput): Promise<void> {
  const uid = uidOf();
  const timed = !e.allDay;
  const data = fields(scope, uid, e);
  if (id === null) {
    if (timed && e.start) data.start = e.start;
    if (timed && e.end) data.end = e.end;
    await addDoc(eventsRef(scope, uid), { ...data, createdBy: uid, updatedAt: serverTimestamp() });
    return;
  }
  data.start = timed && e.start ? e.start : deleteField();
  data.end = timed && e.end ? e.end : deleteField();
  await updateDoc(eventRef(scope, uid, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteEvent(scope: Scope, id: string): Promise<void> {
  await deleteDoc(eventRef(scope, uidOf(), id));
}

function newBatchId(): string {
  const c = globalThis.crypto;
  return (c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`).slice(0, 40);
}

/** Copy an event onto other dates in one atomic batch; all copies share a fresh batchId. */
export async function copyEvent(scope: Scope, e: EventDoc, dates: string[]): Promise<void> {
  const uid = uidOf();
  const copies = copyEventToDates(e, dates);
  if (copies.length === 0) return;
  const batchId = newBatchId();
  const batch = writeBatch(db);
  const col = eventsRef(scope, uid);
  for (const c of copies) {
    const { id: _id, layer: _layer, ...rest } = c as EventDoc & { id?: string; layer?: string };
    batch.set(doc(col), { ...rest, assignees: scope === 'personal' ? [uid] : rest.assignees, batchId, createdBy: uid, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}
