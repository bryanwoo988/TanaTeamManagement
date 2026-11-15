import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { clearDb, db } from './helpers';
import { runDigest } from '../src/digest';

// 20:00 in Kuala Lumpur on 2026-11-15; tomorrow is 2026-11-16.
const AT_8PM = new Date('2026-11-15T12:00:00Z');
const TOMORROW = '2026-11-16';

async function seedUser(uid: string, extra: Record<string, unknown> = {}) {
  await db.doc(`users/${uid}`).set({ name: uid, phone: '+60120000000', lang: 'en', notify: {}, digestTime: '20:00', createdAt: Timestamp.now(), ...extra });
}
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
function ev(over: Record<string, unknown> = {}) {
  return defined({ title: 'Spray', date: TOMORROW, allDay: false, start: '08:00', assignees: ['bob'], place: '', notes: '', createdBy: 'alice', updatedAt: Timestamp.now(), ...over });
}
const digests = async (uid: string) =>
  (await db.collection(`users/${uid}/notifications`).where('kind', '==', 'digest').get()).docs.map((d) => d.data());

beforeEach(async () => {
  await clearDb();
  for (const t of ['t1', 't2']) await db.doc(`teams/${t}`).set({ name: t, createdBy: 'alice', categories: [], createdAt: Timestamp.now() });
  await db.doc('teams/t1/members/bob').set({ uid: 'bob', name: 'Bob', role: 'member', status: 'active', joinedAt: Timestamp.now() });
  await db.doc('teams/t2/members/bob').set({ uid: 'bob', name: 'Bob', role: 'member', status: 'pending', joinedAt: Timestamp.now() });
});

describe('tomorrowDigest', () => {
  it('sends one digest per day with all-day first, across teams and personal events', async () => {
    await seedUser('bob');
    await db.collection('teams/t1/events').add(ev({ title: 'Spray', start: '08:00', place: 'Lot 5' }));
    await db.collection('teams/t1/events').add(ev({ title: 'Harvest', allDay: true, start: undefined }));
    await db.collection('teams/t1/events').add(ev({ title: 'Not mine', assignees: ['carol'] }));
    await db.collection('teams/t1/events').add(ev({ title: 'Day after', date: '2026-11-17' }));
    await db.collection('teams/t2/events').add(ev({ title: 'Pending team' }));
    await db.collection('users/bob/events').add(ev({ title: 'Dentist', start: '15:00' }));
    await db.collection('users/carol/events').add(ev({ title: 'Someone else personal' }));

    await runDigest(AT_8PM);
    await runDigest(AT_8PM);
    const d = await digests('bob');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ title: 'Tomorrow: 3 jobs', body: 'All day · Harvest\n08:00 · Spray @ Lot 5\n15:00 · Dentist', url: `/?date=${TOMORROW}`, read: false });
    expect((await db.doc(`digestSent/bob_${TOMORROW}`).get()).get('expiresAt')).toBeInstanceOf(Timestamp);
  });

  it('sends nothing to someone with no work tomorrow', async () => {
    await seedUser('bob');
    await runDigest(AT_8PM);
    expect(await digests('bob')).toHaveLength(0);
    expect((await db.doc(`digestSent/bob_${TOMORROW}`).get()).exists).toBe(false);
  });

  it('only sends at the chosen time and respects the opt-out', async () => {
    await seedUser('bob', { digestTime: '07:00' });
    await db.collection('teams/t1/events').add(ev());
    await runDigest(AT_8PM);
    expect(await digests('bob')).toHaveLength(0);
    await runDigest(new Date('2026-11-14T23:05:00Z')); // 07:05 KL on 2026-11-15
    expect(await digests('bob')).toHaveLength(1);
    await db.doc('users/bob').update({ digestTime: '20:00', notify: { digest: false } });
    await db.collection('teams/t1/events').add(ev({ date: '2026-11-17' }));
    await runDigest(new Date('2026-11-16T12:00:00Z'));
    expect(await digests('bob')).toHaveLength(1);
  });

  it('a time just before midnight is handled after midnight for the right day', async () => {
    await seedUser('bob', { digestTime: '23:55' });
    await db.collection('teams/t1/events').add(ev());
    await runDigest(new Date('2026-11-15T16:05:00Z')); // 00:05 KL on 2026-11-16
    const d = await digests('bob');
    expect(d).toHaveLength(1);
    expect(d[0].url).toBe('/?date=2026-11-16');
  });
});
