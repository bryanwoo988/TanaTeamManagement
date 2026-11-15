import { beforeEach, describe, expect, it } from 'vitest';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { clearDb, db } from './helpers';
import { notifyUsers } from '../src/notify';
import { addDays, klDate } from '../../shared/dates';

// Relative to the real KL today: 'changed' is skipped for past events.
const TODAY = klDate(new Date());
const D0 = addDays(TODAY, 5);
const D = (n: number) => addDays(D0, n);

const T = 't1';
async function seedUser(uid: string, name: string, extra: Record<string, unknown> = {}) {
  await db.doc(`users/${uid}`).set({ name, phone: '+6012000000' + uid.length, lang: 'en', notify: {}, digestTime: '20:00', createdAt: Timestamp.now(), ...extra });
}
async function seedMember(uid: string, name: string, role: string, status = 'active') {
  await db.doc(`teams/${T}/members/${uid}`).set({ uid, name, role, status, joinedAt: Timestamp.now() });
}
async function waitFor<V>(fn: () => Promise<V>, ok: (v: V) => boolean, ms = 15000): Promise<V> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (ok(v) || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
}
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Deleting the previous test's events (clearDb) fires late 'changed' triggers; pass refId to ignore them.
const notes = async (uid: string, kind: string, refId?: string) =>
  (await db.collection(`users/${uid}/notifications`).where('kind', '==', kind).get()).docs.map((d) => d.data())
    .filter((n) => !refId || n.refId === refId);
const waitNotes = (uid: string, kind: string, n = 1, refId?: string) => waitFor(() => notes(uid, kind, refId), (v) => v.length >= n);

function ev(over: Record<string, unknown> = {}) {
  return defined({ title: 'Spray', date: D0, allDay: false, start: '08:00', end: '10:00', assignees: [], place: 'Lot 5', notes: '', createdBy: 'alice', updatedAt: Timestamp.now(), ...over });
}
function invoice(over: Record<string, unknown> = {}) {
  return defined({ kind: 'claim', amountSen: 1250, date: '2026-11-15', vendor: 'Kedai Ah Seng', category: 'Fuel', notes: '', photoPath: 'teams/t1/invoices/i1/p.jpg',
    uploadedBy: 'bob', uploaderName: 'Bob', relatedUids: [], status: 'pending', createdAt: Timestamp.now(), updatedAt: Timestamp.now(), ...over });
}

beforeEach(async () => {
  await clearDb();
  await db.doc(`teams/${T}`).set({ name: 'East Farm', createdBy: 'alice', categories: [], createdAt: Timestamp.now() });
  await seedUser('alice', 'Alice');
  await seedUser('bob', 'Bob');
  await seedUser('carol', 'Carol');
  await seedUser('dave', 'Dave');
  await seedUser('erin', 'Erin');
  await seedMember('alice', 'Alice', 'admin');
  await seedMember('bob', 'Bob', 'member');
  await seedMember('carol', 'Carol', 'finance');
  await seedMember('dave', 'Dave', 'member');
  await seedMember('erin', 'Erin', 'member');
});

describe('event notifications', () => {
  it('notifies new assignees but not the editor', async () => {
    const ref = await db.collection(`teams/${T}/events`).add(ev({ assignees: ['alice', 'bob'] }));
    const bob = await waitNotes('bob', 'assigned', 1, ref.id);
    expect(bob).toHaveLength(1);
    expect(bob[0]).toMatchObject({ kind: 'assigned', teamId: T, title: 'New work: Spray', body: `East Farm · ${D0} 08:00`, read: false, url: `/?team=t1&date=${D0}` });
    expect(bob[0].createdAt).toBeInstanceOf(Timestamp);
    expect(await notes('alice', 'assigned', ref.id)).toHaveLength(0);
  });

  it('writes the text in the recipient language', async () => {
    await db.doc('users/bob').update({ lang: 'zh' });
    const ref = await db.collection(`teams/${T}/events`).add(ev({ assignees: ['bob'] }));
    const [n] = await waitNotes('bob', 'assigned', 1, ref.id);
    expect(n.title).toBe('新工作：Spray');
  });

  it('skips people who are no longer active members', async () => {
    await db.doc(`teams/${T}/members/bob`).delete();
    await seedMember('dave', 'Dave', 'member', 'pending');
    const ref = await db.collection(`teams/${T}/events`).add(ev({ assignees: ['bob', 'dave', 'carol'] }));
    await waitNotes('carol', 'assigned', 1, ref.id);
    expect(await notes('bob', 'assigned', ref.id)).toHaveLength(0);
    expect(await notes('dave', 'assigned', ref.id)).toHaveLength(0);
  });

  it('respects opt-outs except for mandatory kinds', async () => {
    await db.doc('users/bob').update({ notify: { companyInvoice: false, assigned: false, changed: false } });
    const inv = await db.collection(`teams/${T}/invoices`).add(invoice({ kind: 'company', uploadedBy: 'carol', uploaderName: 'Carol', relatedUids: ['bob', 'dave'], status: undefined }));
    await waitNotes('dave', 'companyInvoice', 1, inv.id);
    expect(await notes('bob', 'companyInvoice', inv.id)).toHaveLength(0);
    const ref = await db.collection(`teams/${T}/events`).add(ev({ assignees: ['bob'] }));
    expect(await waitNotes('bob', 'assigned', 1, ref.id)).toHaveLength(1);
    await ref.update({ start: '11:00' });
    expect(await waitNotes('bob', 'changed', 1, ref.id)).toHaveLength(1);
  });

  it('removed assignees get the cancelled variant, those staying get nothing', async () => {
    const ref = await db.collection(`teams/${T}/events`).add(ev({ assignees: ['bob', 'dave'] }));
    await waitNotes('dave', 'assigned', 1, ref.id);
    await ref.update({ assignees: ['bob'] });
    const [c] = await waitNotes('dave', 'changed', 1, ref.id);
    expect(c.title).toBe('Work cancelled: Spray');
    await sleep(1500);
    expect(await notes('bob', 'changed', ref.id)).toHaveLength(0);
  });

  it('no changed/cancelled about the past, but a move into the future notifies', async () => {
    const past = addDays(TODAY, -2);
    const old = await db.collection(`teams/${T}/events`).add(ev({ date: past, assignees: ['bob', 'dave'] }));
    await waitNotes('bob', 'assigned', 1, old.id);
    await old.update({ start: '09:00' });              // after date past: no 'changed'
    await old.update({ assignees: ['bob', 'erin'] });  // before date past: dave no cancel; after past: erin no 'assigned'
    await old.delete();                                 // before date past: no cancel
    const toPast = await db.collection(`teams/${T}/events`).add(ev({ assignees: ['carol'] }));
    await waitNotes('carol', 'assigned', 1, toPast.id);
    await toPast.update({ date: past });                // future -> past: no 'changed'
    // Written last, so it doubles as the sentinel: past -> future does send 'changed'.
    const moved = await db.collection(`teams/${T}/events`).add(ev({ date: past, assignees: ['carol'] }));
    await waitNotes('carol', 'assigned', 1, moved.id);
    await moved.update({ date: D0 });
    const [m] = await waitNotes('carol', 'changed', 1, moved.id);
    expect(m.title).toBe('Work changed: Spray');
    await sleep(1500);
    expect(await notes('bob', 'changed', old.id)).toHaveLength(0);
    expect(await notes('dave', 'changed', old.id)).toHaveLength(0);
    expect(await notes('erin', 'assigned', old.id)).toHaveLength(0);
    expect(await notes('carol', 'changed', toPast.id)).toHaveLength(0);
  });

  it('update: added get assigned, remaining get changed on time change; delete sends cancelled', async () => {
    const ref = await db.collection(`teams/${T}/events`).add(ev({ assignees: ['bob'] }));
    await waitNotes('bob', 'assigned', 1, ref.id);
    // Non-time edit: no 'changed'.
    await ref.update({ notes: 'bring gloves', assignees: ['bob', 'dave'] });
    await waitNotes('dave', 'assigned', 1, ref.id);
    await ref.update({ start: '09:00' });
    const [changed] = await waitNotes('bob', 'changed', 1, ref.id);
    expect(changed.title).toBe('Work changed: Spray');
    expect(changed.body).toBe(`East Farm · ${D0} 09:00`);
    expect(await waitNotes('dave', 'changed', 1, ref.id)).toHaveLength(1);
    expect(await notes('bob', 'changed', ref.id)).toHaveLength(1);
    expect(await notes('bob', 'assigned', ref.id)).toHaveLength(1);
    await ref.delete();
    const cancelled = await waitNotes('bob', 'changed', 2, ref.id);
    expect(cancelled.map((n) => n.title)).toContain('Work cancelled: Spray');
  });

  it('a copy to 4 dates sends exactly one assigned with count 4', async () => {
    const batch = db.batch();
    const ids: string[] = [];
    for (const d of [D(1), D(0), D(2), D(3)]) {
      const r = db.collection(`teams/${T}/events`).doc();
      ids.push(r.id);
      batch.set(r, ev({ date: d, assignees: ['bob'], batchId: 'b-1' }));
    }
    await batch.commit();
    await waitNotes('bob', 'assigned', 1, 'batch_b-1');
    await sleep(3000);
    const all = (await notes('bob', 'assigned')).filter((n) => n.refId === 'batch_b-1' || ids.includes(n.refId));
    expect(all).toHaveLength(1);
    expect(all[0].body).toBe(`East Farm · 4 dates from ${D0} 08:00`);
    expect((await db.doc(`notifyBatches/${T}_b-1`).get()).get('expiresAt')).toBeInstanceOf(Timestamp);
  });
});

describe('web push', () => {
  it('pushes to every subscription and deletes gone ones', async () => {
    const keys = { p256dh: 'k', auth: 'a' };
    await db.doc('users/bob/pushSubs/gone').set({ endpoint: 'https://push.example/gone/1', keys, ua: 'x', createdAt: Timestamp.now() });
    await db.doc('users/bob/pushSubs/nf').set({ endpoint: 'https://push.example/notfound/1', keys, ua: 'x', createdAt: Timestamp.now() });
    await db.doc('users/bob/pushSubs/ok').set({ endpoint: 'https://push.example/ok/1', keys, ua: 'x', createdAt: Timestamp.now() });
    const ref = await db.collection(`teams/${T}/events`).add(ev({ assignees: ['bob'] }));
    const gone = await waitFor(() => db.doc('users/bob/pushSubs/gone').get(), (s) => !s.exists);
    expect(gone.exists).toBe(false);
    expect((await waitFor(() => db.doc('users/bob/pushSubs/nf').get(), (s) => !s.exists)).exists).toBe(false);
    expect((await db.doc('users/bob/pushSubs/ok').get()).exists).toBe(true);
    // Seeding members also raises 'joined' pushes; look at this event's only.
    const assignedLog = async () => (await db.collection('_pushLog').get()).docs.map((d) => d.data()).filter((l) => JSON.parse(l.payload).tag === ref.id);
    const log = await waitFor(assignedLog, (v) => v.length > 0);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ uid: 'bob', endpoint: 'https://push.example/ok/1' });
    expect(JSON.parse(log[0].payload)).toEqual({ title: 'New work: Spray', body: `East Farm · ${D0} 08:00`, url: `/?team=t1&date=${D0}`, tag: ref.id, kind: 'assigned' });
  });
});

describe('invoice notifications', () => {
  it('company invoice: admins and related staff, not the uploader', async () => {
    const ref = await db.collection(`teams/${T}/invoices`).add(invoice({ kind: 'company', uploadedBy: 'alice', uploaderName: 'Alice', relatedUids: ['dave'], status: undefined }));
    const [d] = await waitNotes('dave', 'companyInvoice', 1, ref.id);
    expect(d.body).toBe('Alice uploaded Kedai Ah Seng RM 12.50 (East Farm)');
    expect(await notes('alice', 'companyInvoice', ref.id)).toHaveLength(0);
    expect(await notes('bob', 'companyInvoice', ref.id)).toHaveLength(0);
    expect(await notes('carol', 'companyInvoice', ref.id)).toHaveLength(0);
  });

  it('claim: submit, reject, resubmit and reimburse', async () => {
    const ref = await db.collection(`teams/${T}/invoices`).add(invoice());
    await waitNotes('alice', 'claimSubmitted', 1, ref.id);
    expect(await waitNotes('carol', 'claimSubmitted', 1, ref.id)).toHaveLength(1);
    expect(await notes('bob', 'claimSubmitted', ref.id)).toHaveLength(0);
    expect(await notes('dave', 'claimSubmitted', ref.id)).toHaveLength(0);

    await ref.update({ status: 'rejected', rejectReason: 'Blurry' });
    const [rej] = await waitNotes('bob', 'claimDone', 1, ref.id);
    expect(rej.body).toContain('Blurry');
    await ref.update({ status: 'pending', rejectReason: FieldValue.delete() });
    expect(await waitNotes('carol', 'claimSubmitted', 2, ref.id)).toHaveLength(2);
    await ref.update({ status: 'reimbursed' });
    expect(await waitNotes('bob', 'claimDone', 2, ref.id)).toHaveLength(2);
    await ref.update({ notes: 'x' });
    await sleep(1500);
    expect(await notes('bob', 'claimDone', ref.id)).toHaveLength(2);
    expect(await notes('alice', 'claimSubmitted', ref.id)).toHaveLength(2);
  });
});

describe('notifyUsers', () => {
  it('a repeated delivery with the same id writes one doc and keeps it read', async () => {
    const n = { kind: 'joined' as const, id: 'evt-1_joined', vars: { team: 'East Farm' }, url: '/' };
    await notifyUsers(['bob'], n);
    await db.doc('users/bob/notifications/evt-1_joined').update({ read: true });
    await notifyUsers(['bob'], n);
    const doc = await db.doc('users/bob/notifications/evt-1_joined').get();
    expect(doc.data()).toMatchObject({ kind: 'joined', title: 'Joined team', read: true });
  });
});
