import { beforeEach, describe, expect, it, vi } from 'vitest';

const batchSet = vi.fn();
const batchCommit = vi.fn().mockResolvedValue(undefined);
const writeBatch = vi.fn(() => ({ set: batchSet, commit: batchCommit }));
const addDoc = vi.fn().mockResolvedValue({ id: 'new1' });
const updateDoc = vi.fn().mockResolvedValue(undefined);
const deleteDoc = vi.fn().mockResolvedValue(undefined);
const getDocs = vi.fn();
vi.mock('../firebase', () => ({ db: {}, auth: { currentUser: { uid: 'me' } } }));
vi.mock('firebase/firestore', () => ({
  collection: (_d: unknown, ...p: string[]) => ({ path: p.join('/') }),
  doc: (c: unknown, ...p: string[]) => (p.length ? { path: [(c as { path?: string }).path, ...p].filter(Boolean).join('/') } : { path: `${(c as { path: string }).path}/auto` }),
  where: (f: string, op: string, v: string) => ({ f, op, v }),
  query: (c: { path: string }, ...w: unknown[]) => ({ path: c.path, w }),
  getDocs: (...a: unknown[]) => getDocs(...a),
  addDoc: (...a: unknown[]) => addDoc(...a),
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  deleteDoc: (...a: unknown[]) => deleteDoc(...a),
  writeBatch: () => writeBatch(),
  serverTimestamp: () => 'TS',
  deleteField: () => 'DEL',
}));

import { copyEvent, deleteEvent, listEvents, saveEvent } from './data';

const base = { title: 'Spray', date: '2026-11-10', allDay: false, start: '09:00', end: '10:00', assignees: ['me'], place: 'Plot 3', notes: '' };
beforeEach(() => vi.clearAllMocks());

describe('calendar data', () => {
  it('lists events of a team in a date range', async () => {
    getDocs.mockResolvedValue({ docs: [{ id: 'e1', data: () => base }] });
    const r = await listEvents({ teamId: 't1' }, '2026-11-01', '2026-11-30');
    expect(getDocs.mock.calls[0][0].path).toBe('teams/t1/events');
    expect(getDocs.mock.calls[0][0].w).toEqual([{ f: 'date', op: '>=', v: '2026-11-01' }, { f: 'date', op: '<=', v: '2026-11-30' }]);
    expect(r).toEqual([{ ...base, id: 'e1' }]);
  });

  it('personal scope reads users/{uid}/events', async () => {
    getDocs.mockResolvedValue({ docs: [] });
    await listEvents('personal', '2026-11-01', '2026-11-30');
    expect(getDocs.mock.calls[0][0].path).toBe('users/me/events');
  });

  it('creates with createdBy and a server timestamp', async () => {
    await saveEvent({ teamId: 't1' }, null, base);
    expect(addDoc).toHaveBeenCalledWith({ path: 'teams/t1/events' }, { ...base, createdBy: 'me', updatedAt: 'TS' });
  });

  it('personal events always have assignees = [uid]', async () => {
    await saveEvent('personal', null, { ...base, assignees: ['x', 'y'] });
    expect(addDoc.mock.calls[0][1].assignees).toEqual(['me']);
  });

  it('updates with a server timestamp and drops times for all-day events', async () => {
    await saveEvent({ teamId: 't1' }, 'e1', { ...base, allDay: true });
    const [ref, data] = updateDoc.mock.calls[0];
    expect(ref).toEqual({ path: 'teams/t1/events/e1' });
    expect(data).toMatchObject({ allDay: true, updatedAt: 'TS', start: 'DEL', end: 'DEL' });
    expect(data).not.toHaveProperty('createdBy');
  });

  it('deletes', async () => {
    await deleteEvent('personal', 'e9');
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'users/me/events/e9' });
  });

  it('copies in one batch with a shared batchId, current uid and server timestamp', async () => {
    await copyEvent({ teamId: 't1' }, { ...base, createdBy: 'boss', updatedAt: 'old' as never, batchId: 'oldb' }, ['2026-11-12', '2026-11-11', '2026-11-10']);
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(batchSet).toHaveBeenCalledTimes(2);
    const docs = batchSet.mock.calls.map((c) => c[1]);
    expect(docs.map((d) => d.date)).toEqual(['2026-11-11', '2026-11-12']);
    const ids = new Set(docs.map((d) => d.batchId));
    expect(ids.size).toBe(1);
    const id = docs[0].batchId as string;
    expect(id).not.toBe('oldb');
    expect(id.length).toBeLessThanOrEqual(40);
    for (const d of docs) expect(d).toMatchObject({ createdBy: 'me', updatedAt: 'TS', title: 'Spray' });
  });

  it('rejects more than 60 dates', async () => {
    const dates = Array.from({ length: 61 }, (_, i) => `2027-01-${String(i + 1).padStart(2, '0')}`);
    await expect(copyEvent('personal', { ...base, createdBy: 'me', updatedAt: 'x' as never }, dates)).rejects.toThrow('tooManyDates');
    expect(batchCommit).not.toHaveBeenCalled();
  });
});
