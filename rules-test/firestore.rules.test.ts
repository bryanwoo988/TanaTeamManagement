import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-tana',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());

const now = () => Timestamp.now();
const PHONE = '+60123456789';

// Team A: admin, admin2, fin (finance), mem, mem2 (members), pend (pending). Team B: bAdmin, bMem.
// `gone` was removed from team A (no member doc) but still has a claim there.
const TEAM_A_MEMBERS: Record<string, [string, string]> = {
  admin: ['admin', 'active'], admin2: ['admin', 'active'], fin: ['finance', 'active'],
  mem: ['member', 'active'], mem2: ['member', 'active'], pend: ['member', 'pending'],
};

const seedEvent = (assignees: string[], createdBy = 'admin') => ({
  title: 'Spray', date: '2026-11-20', allDay: false, start: '08:00', end: '10:00', assignees,
  place: 'Block 3', notes: '', createdBy, updatedAt: now(),
});
const seedInvoice = (t: string, id: string, over: object) => ({
  kind: 'claim', amountSen: 1250, date: '2026-11-14', vendor: 'Kedai', category: '燃油 Fuel', notes: '',
  photoPath: `teams/${t}/invoices/${id}/p1.jpg`, uploadedBy: 'mem', uploaderName: 'Mem', relatedUids: [],
  status: 'pending', createdAt: now(), updatedAt: now(), ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'teams/A'), { name: 'Team A', createdBy: 'admin', categories: ['x'], createdAt: now() });
    for (const [uid, [role, status]] of Object.entries(TEAM_A_MEMBERS)) {
      await setDoc(doc(db, `teams/A/members/${uid}`), { uid, name: uid, role, status, joinedAt: now() });
    }
    await setDoc(doc(db, 'teams/B'), { name: 'Team B', createdBy: 'bAdmin', categories: ['x'], createdAt: now() });
    await setDoc(doc(db, 'teams/B/members/bAdmin'), { uid: 'bAdmin', name: 'bAdmin', role: 'admin', status: 'active', joinedAt: now() });
    await setDoc(doc(db, 'teams/B/members/bMem'), { uid: 'bMem', name: 'bMem', role: 'member', status: 'active', joinedAt: now() });

    await setDoc(doc(db, 'teams/A/events/e1'), seedEvent(['mem']));
    await setDoc(doc(db, 'teams/A/events/e2'), seedEvent(['mem2']));
    await setDoc(doc(db, 'teams/B/events/eb1'), seedEvent(['bMem'], 'bAdmin'));

    const inv: Record<string, object> = {
      claimMem: {},
      claimMemRej: { status: 'rejected', rejectReason: 'blurry' },
      claimMemPaid: { status: 'reimbursed', paidDate: '2026-11-15' },
      claimMem2: { uploadedBy: 'mem2', uploaderName: 'Mem2' },
      company1: { kind: 'company', uploadedBy: 'fin', uploaderName: 'Fin', relatedUids: ['mem'], status: undefined },
      company2: { kind: 'company', uploadedBy: 'fin', uploaderName: 'Fin', status: undefined },
      claimGone: { uploadedBy: 'gone', uploaderName: 'Gone' },
    };
    for (const [id, over] of Object.entries(inv)) {
      const data: Record<string, unknown> = seedInvoice('A', id, over);
      if (data.status === undefined) delete data.status;
      await setDoc(doc(db, `teams/A/invoices/${id}`), data);
    }
    await setDoc(doc(db, 'teams/B/invoices/ib1'), seedInvoice('B', 'ib1', { uploadedBy: 'bMem', uploaderName: 'bMem' }));

    await setDoc(doc(db, 'users/mem'), { name: 'Mem', phone: PHONE, lang: 'zh', notify: { digest: true }, digestTime: '20:00', createdAt: now() });
    await setDoc(doc(db, 'users/mem2'), { name: 'Mem2', phone: '+60129999999', lang: 'en', notify: {}, digestTime: '20:00', createdAt: now() });
    await setDoc(doc(db, 'users/mem/notifications/n1'), { kind: 'assigned', teamId: 'A', refId: 'e1', title: 't', body: 'b', url: '/', read: false, createdAt: now() });
    await setDoc(doc(db, 'users/mem/teams/A'), { teamId: 'A', name: 'Team A', role: 'member', status: 'active' });
    await setDoc(doc(db, 'users/mem/events/p1'), { ...seedEvent(['mem'], 'mem') });
    await setDoc(doc(db, 'users/mem/pushSubs/s1'), { endpoint: 'https://x', keys: { p256dh: 'a', auth: 'b' }, ua: 'ua', createdAt: now() });

    await setDoc(doc(db, 'inviteCodes/TANA-AAAA'), { teamId: 'A', createdAt: now() });
    await setDoc(doc(db, `phoneInvites/A_${PHONE}`), { teamId: 'A', teamName: 'Team A', phone: PHONE, name: 'X', role: 'member', createdBy: 'admin', createdAt: now() });
    await setDoc(doc(db, `phoneInvites/B_${PHONE}`), { teamId: 'B', teamName: 'Team B', phone: PHONE, name: 'X', role: 'member', createdBy: 'bAdmin', createdAt: now() });
    await setDoc(doc(db, 'rateLimits/otp_abc'), { count: 1, expiresAt: now() });
    await setDoc(doc(db, 'digestSent/mem_2026-11-16'), { at: now() });
  });
});

const as = (uid: string, phone?: string) =>
  env.authenticatedContext(uid, phone ? { phone_number: phone } : {}).firestore();
const anon = () => env.unauthenticatedContext().firestore();

// ---------------------------------------------------------------- users
describe('users/{uid}', () => {
  const profile = (over: object = {}) => ({
    name: 'New', phone: '+60111111111', lang: 'ms', notify: { digest: false }, digestTime: '19:30',
    createdAt: serverTimestamp(), ...over,
  });

  it('reads own profile', async () => { await assertSucceeds(getDoc(doc(as('mem'), 'users/mem'))); });
  it('cannot read another profile', async () => { await assertFails(getDoc(doc(as('mem2'), 'users/mem'))); });
  it('unauthenticated cannot read', async () => { await assertFails(getDoc(doc(anon(), 'users/mem'))); });

  it('creates own profile with token phone', async () => {
    await assertSucceeds(setDoc(doc(as('newU', '+60111111111'), 'users/newU'), profile()));
  });
  it('cannot create a profile for another uid', async () => {
    await assertFails(setDoc(doc(as('newU', '+60111111111'), 'users/other'), profile()));
  });
  it('cannot create with a phone different from the token', async () => {
    await assertFails(setDoc(doc(as('newU', '+60111111111'), 'users/newU'), profile({ phone: '+60122222222' })));
  });
  it('cannot create without a phone in the token', async () => {
    await assertFails(setDoc(doc(as('newU'), 'users/newU'), profile()));
  });
  it('cannot create with extra keys', async () => {
    await assertFails(setDoc(doc(as('newU', '+60111111111'), 'users/newU'), profile({ roles: ['admin'] })));
  });
  it('cannot create with missing keys', async () => {
    const p: Record<string, unknown> = profile();
    delete p.digestTime;
    await assertFails(setDoc(doc(as('newU', '+60111111111'), 'users/newU'), p));
  });
  it('cannot create with bad lang / digestTime / createdAt / empty name', async () => {
    const u = as('newU', '+60111111111');
    await assertFails(setDoc(doc(u, 'users/newU'), profile({ lang: 'fr' })));
    await assertFails(setDoc(doc(u, 'users/newU'), profile({ digestTime: '25:00' })));
    await assertFails(setDoc(doc(u, 'users/newU'), profile({ digestTime: '8:00' })));
    await assertFails(setDoc(doc(u, 'users/newU'), profile({ createdAt: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(doc(u, 'users/newU'), profile({ name: '' })));
  });
  it('cannot create with mandatory notifications turned off', async () => {
    const u = as('newU', '+60111111111');
    await assertFails(setDoc(doc(u, 'users/newU'), profile({ notify: { assigned: false } })));
    await assertFails(setDoc(doc(u, 'users/newU'), profile({ notify: { changed: false } })));
  });
  it('cannot create with unknown notify kinds or non-bool values', async () => {
    const u = as('newU', '+60111111111');
    await assertFails(setDoc(doc(u, 'users/newU'), profile({ notify: { spam: true } })));
    await assertFails(setDoc(doc(u, 'users/newU'), profile({ notify: { digest: 'no' } })));
  });

  it('updates own name, lang, notify, digestTime', async () => {
    await assertSucceeds(updateDoc(doc(as('mem', PHONE), 'users/mem'), {
      name: 'Mem X', lang: 'en', notify: { digest: false, companyInvoice: false, assigned: true }, digestTime: '07:15',
    }));
  });
  it('cannot update own phone or createdAt', async () => {
    await assertFails(updateDoc(doc(as('mem', PHONE), 'users/mem'), { phone: '+60100000000' }));
    await assertFails(updateDoc(doc(as('mem', PHONE), 'users/mem'), { createdAt: serverTimestamp() }));
  });
  it('cannot add arbitrary fields', async () => {
    await assertFails(updateDoc(doc(as('mem', PHONE), 'users/mem'), { roles: ['admin'] }));
  });
  it('cannot turn off assigned/changed notifications', async () => {
    await assertFails(updateDoc(doc(as('mem', PHONE), 'users/mem'), { 'notify.assigned': false }));
    await assertFails(updateDoc(doc(as('mem', PHONE), 'users/mem'), { notify: { changed: false } }));
  });
  it('cannot set invalid lang or digestTime on update', async () => {
    await assertFails(updateDoc(doc(as('mem', PHONE), 'users/mem'), { lang: 'xx' }));
    await assertFails(updateDoc(doc(as('mem', PHONE), 'users/mem'), { digestTime: '2000' }));
    await assertFails(updateDoc(doc(as('mem', PHONE), 'users/mem'), { name: '' }));
  });
  it('cannot update another profile', async () => {
    await assertFails(updateDoc(doc(as('mem2'), 'users/mem'), { name: 'hacked' }));
  });
  it('cannot delete own profile', async () => {
    await assertFails(deleteDoc(doc(as('mem', PHONE), 'users/mem')));
  });
});

describe('users/{uid} subcollections', () => {
  const personal = (over: object = {}) => ({
    title: 'Dentist', date: '2026-11-21', allDay: true, assignees: [], place: '', notes: '',
    createdBy: 'mem', updatedAt: serverTimestamp(), ...over,
  });

  it('personal events: own read/create/update/delete', async () => {
    const u = as('mem');
    await assertSucceeds(getDoc(doc(u, 'users/mem/events/p1')));
    await assertSucceeds(setDoc(doc(u, 'users/mem/events/p2'), personal()));
    await assertSucceeds(updateDoc(doc(u, 'users/mem/events/p1'), { title: 'Moved', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(u, 'users/mem/events/p1')));
  });
  it('personal events: others cannot read or write', async () => {
    const u = as('mem2');
    await assertFails(getDoc(doc(u, 'users/mem/events/p1')));
    await assertFails(setDoc(doc(u, 'users/mem/events/p9'), personal({ createdBy: 'mem2' })));
    await assertFails(deleteDoc(doc(u, 'users/mem/events/p1')));
    await assertFails(getDoc(doc(as('admin'), 'users/mem/events/p1')));
  });
  it('personal events: field validation', async () => {
    const u = as('mem');
    await assertFails(setDoc(doc(u, 'users/mem/events/p2'), personal({ title: '' })));
    await assertFails(setDoc(doc(u, 'users/mem/events/p2'), personal({ title: 'x'.repeat(121) })));
    await assertFails(setDoc(doc(u, 'users/mem/events/p2'), personal({ date: '2026/11/21' })));
    await assertFails(setDoc(doc(u, 'users/mem/events/p2'), personal({ createdBy: 'mem2' })));
    await assertFails(setDoc(doc(u, 'users/mem/events/p2'), personal({ updatedAt: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(doc(u, 'users/mem/events/p2'), personal({ extra: 1 })));
    await assertFails(updateDoc(doc(u, 'users/mem/events/p1'), { title: 'no time bump' }));
  });

  it('pushSubs: own only', async () => {
    const sub = { endpoint: 'https://y', keys: { p256dh: 'a', auth: 'b' }, ua: 'ua', createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('mem'), 'users/mem/pushSubs/s2'), sub));
    await assertSucceeds(getDoc(doc(as('mem'), 'users/mem/pushSubs/s1')));
    await assertSucceeds(deleteDoc(doc(as('mem'), 'users/mem/pushSubs/s1')));
    await assertFails(getDoc(doc(as('mem2'), 'users/mem/pushSubs/s2')));
    await assertFails(setDoc(doc(as('mem2'), 'users/mem/pushSubs/s3'), sub));
  });

  it('notifications: own read, only toggle read', async () => {
    await assertSucceeds(getDoc(doc(as('mem'), 'users/mem/notifications/n1')));
    await assertSucceeds(updateDoc(doc(as('mem'), 'users/mem/notifications/n1'), { read: true }));
    await assertFails(updateDoc(doc(as('mem'), 'users/mem/notifications/n1'), { title: 'x' }));
    await assertFails(updateDoc(doc(as('mem'), 'users/mem/notifications/n1'), { read: 'yes' }));
  });
  it('notifications: no client create/delete, others cannot read', async () => {
    await assertFails(setDoc(doc(as('mem'), 'users/mem/notifications/n2'), { kind: 'assigned', title: 't', body: 'b', url: '/', read: false, createdAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as('mem'), 'users/mem/notifications/n1')));
    await assertFails(getDoc(doc(as('mem2'), 'users/mem/notifications/n1')));
    await assertFails(updateDoc(doc(as('mem2'), 'users/mem/notifications/n1'), { read: true }));
  });

  it('teams index: own read only, no client write', async () => {
    await assertSucceeds(getDoc(doc(as('mem'), 'users/mem/teams/A')));
    await assertSucceeds(getDocs(collection(as('mem'), 'users/mem/teams')));
    await assertFails(getDoc(doc(as('mem2'), 'users/mem/teams/A')));
    await assertFails(setDoc(doc(as('mem'), 'users/mem/teams/B'), { teamId: 'B', name: 'B', role: 'admin', status: 'active' }));
    await assertFails(updateDoc(doc(as('mem'), 'users/mem/teams/A'), { role: 'admin' }));
    await assertFails(deleteDoc(doc(as('mem'), 'users/mem/teams/A')));
  });
});

// ---------------------------------------------------------------- teams
describe('teams/{t}', () => {
  it('active members read the team', async () => {
    await assertSucceeds(getDoc(doc(as('mem'), 'teams/A')));
    await assertSucceeds(getDoc(doc(as('fin'), 'teams/A')));
  });
  it('pending, removed, outsiders and anonymous cannot read', async () => {
    await assertFails(getDoc(doc(as('pend'), 'teams/A')));
    await assertFails(getDoc(doc(as('gone'), 'teams/A')));
    await assertFails(getDoc(doc(as('bMem'), 'teams/A')));
    await assertFails(getDoc(doc(anon(), 'teams/A')));
  });
  it('admin updates name and categories', async () => {
    await assertSucceeds(updateDoc(doc(as('admin'), 'teams/A'), { name: 'Renamed', categories: ['a', 'b'] }));
  });
  it('admin cannot change createdBy or add fields, or set bad values', async () => {
    await assertFails(updateDoc(doc(as('admin'), 'teams/A'), { createdBy: 'mem' }));
    await assertFails(updateDoc(doc(as('admin'), 'teams/A'), { extra: true }));
    await assertFails(updateDoc(doc(as('admin'), 'teams/A'), { name: '' }));
    await assertFails(updateDoc(doc(as('admin'), 'teams/A'), { categories: 'x' }));
  });
  it('finance and members cannot update the team', async () => {
    await assertFails(updateDoc(doc(as('fin'), 'teams/A'), { categories: ['a'] }));
    await assertFails(updateDoc(doc(as('mem'), 'teams/A'), { name: 'x' }));
  });
  it('admin of another team cannot update', async () => {
    await assertFails(updateDoc(doc(as('bAdmin'), 'teams/A'), { name: 'pwned' }));
  });
  it('no client create or delete', async () => {
    await assertFails(setDoc(doc(as('mem'), 'teams/C'), { name: 'C', createdBy: 'mem', categories: [], createdAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as('admin'), 'teams/A')));
  });
});

// ---------------------------------------------------------------- members
describe('teams/{t}/members', () => {
  it('active members read team members (doc and list)', async () => {
    await assertSucceeds(getDoc(doc(as('mem'), 'teams/A/members/admin')));
    await assertSucceeds(getDocs(collection(as('mem'), 'teams/A/members')));
  });
  it('pending member reads own doc only', async () => {
    await assertSucceeds(getDoc(doc(as('pend'), 'teams/A/members/pend')));
    await assertFails(getDoc(doc(as('pend'), 'teams/A/members/admin')));
    await assertFails(getDocs(collection(as('pend'), 'teams/A/members')));
  });
  it('outsider and removed user cannot list members', async () => {
    await assertFails(getDocs(collection(as('bMem'), 'teams/A/members')));
    await assertFails(getDoc(doc(as('gone'), 'teams/A/members/admin')));
  });
  it('admin approves a pending member and changes roles of others', async () => {
    await assertSucceeds(updateDoc(doc(as('admin'), 'teams/A/members/pend'), { status: 'active' }));
    await assertSucceeds(updateDoc(doc(as('admin'), 'teams/A/members/mem'), { role: 'finance' }));
    await assertSucceeds(updateDoc(doc(as('admin'), 'teams/A/members/admin2'), { role: 'member' }));
  });
  it('admin cannot set invalid role/status, demote to pending, or touch other fields', async () => {
    await assertFails(updateDoc(doc(as('admin'), 'teams/A/members/mem'), { role: 'owner' }));
    await assertFails(updateDoc(doc(as('admin'), 'teams/A/members/mem'), { status: 'banned' }));
    await assertFails(updateDoc(doc(as('admin'), 'teams/A/members/mem'), { status: 'pending' }));
    await assertFails(updateDoc(doc(as('admin'), 'teams/A/members/mem'), { name: 'Renamed' }));
    await assertFails(updateDoc(doc(as('admin'), 'teams/A/members/mem'), { uid: 'x' }));
  });
  it('admin cannot demote or delete self (last-admin protection)', async () => {
    await assertFails(updateDoc(doc(as('admin'), 'teams/A/members/admin'), { role: 'member' }));
    await assertFails(updateDoc(doc(as('admin'), 'teams/A/members/admin'), { role: 'admin' }));
    await assertFails(deleteDoc(doc(as('admin'), 'teams/A/members/admin')));
  });
  it('admin deletes (removes / rejects) other members', async () => {
    await assertSucceeds(deleteDoc(doc(as('admin'), 'teams/A/members/pend')));
    await assertSucceeds(deleteDoc(doc(as('admin'), 'teams/A/members/mem')));
  });
  it('member cannot raise own role or approve self', async () => {
    await assertFails(updateDoc(doc(as('mem'), 'teams/A/members/mem'), { role: 'admin' }));
    await assertFails(updateDoc(doc(as('fin'), 'teams/A/members/fin'), { role: 'admin' }));
    await assertFails(updateDoc(doc(as('pend'), 'teams/A/members/pend'), { status: 'active' }));
  });
  it('finance and members cannot change or delete others', async () => {
    await assertFails(updateDoc(doc(as('fin'), 'teams/A/members/mem'), { role: 'finance' }));
    await assertFails(updateDoc(doc(as('mem'), 'teams/A/members/pend'), { status: 'active' }));
    await assertFails(deleteDoc(doc(as('fin'), 'teams/A/members/mem')));
    await assertFails(deleteDoc(doc(as('mem'), 'teams/A/members/mem2')));
  });
  it('pending admin cannot act as admin', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'teams/A/members/pend'), { role: 'admin' }));
    await assertFails(updateDoc(doc(as('pend'), 'teams/A/members/mem'), { role: 'finance' }));
    await assertFails(getDoc(doc(as('pend'), 'teams/A/events/e1')));
  });
  it('admin of team B cannot touch team A members', async () => {
    await assertFails(updateDoc(doc(as('bAdmin'), 'teams/A/members/mem'), { role: 'admin' }));
    await assertFails(deleteDoc(doc(as('bAdmin'), 'teams/A/members/mem')));
  });
  it('no client create (not even admin, not even self-join)', async () => {
    const m = { uid: 'x', name: 'x', role: 'member', status: 'active', joinedAt: serverTimestamp() };
    await assertFails(setDoc(doc(as('admin'), 'teams/A/members/x'), m));
    await assertFails(setDoc(doc(as('x'), 'teams/A/members/x'), m));
    await assertFails(setDoc(doc(as('bMem'), 'teams/A/members/bMem'), { ...m, uid: 'bMem' }));
  });
});

// ---------------------------------------------------------------- events
describe('teams/{t}/events', () => {
  const ev = (over: object = {}) => ({
    title: 'Fertilise', date: '2026-11-22', allDay: false, start: '07:00', end: '09:30', assignees: ['mem'],
    place: 'Block 1', notes: '', createdBy: 'mem', updatedAt: serverTimestamp(), ...over,
  });

  it('active members (any role) read events', async () => {
    await assertSucceeds(getDoc(doc(as('mem'), 'teams/A/events/e2')));
    await assertSucceeds(getDocs(collection(as('fin'), 'teams/A/events')));
  });
  it('pending, removed, outsider cannot read events', async () => {
    await assertFails(getDoc(doc(as('pend'), 'teams/A/events/e1')));
    await assertFails(getDocs(collection(as('pend'), 'teams/A/events')));
    await assertFails(getDoc(doc(as('gone'), 'teams/A/events/e1')));
    await assertFails(getDocs(collection(as('bMem'), 'teams/A/events')));
    await assertFails(getDoc(doc(as('bAdmin'), 'teams/A/events/e1')));
  });
  it('user whose member doc was deleted loses access', async () => {
    await assertSucceeds(getDoc(doc(as('mem'), 'teams/A/events/e1')));
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'teams/A/members/mem')));
    await assertFails(getDoc(doc(as('mem'), 'teams/A/events/e1')));
    await assertFails(updateDoc(doc(as('mem'), 'teams/A/events/e1'), { title: 'x', updatedAt: serverTimestamp() }));
  });

  it('member creates an event assigned only to self', async () => {
    await assertSucceeds(setDoc(doc(as('mem'), 'teams/A/events/n1'), ev()));
    const allDay: Record<string, unknown> = ev({ allDay: true, batchId: 'b-123' });
    delete allDay.start;
    delete allDay.end;
    await assertSucceeds(setDoc(doc(as('mem'), 'teams/A/events/n2'), allDay));
  });
  it('member cannot assign others or nobody', async () => {
    await assertFails(setDoc(doc(as('mem'), 'teams/A/events/n1'), ev({ assignees: ['mem2'] })));
    await assertFails(setDoc(doc(as('mem'), 'teams/A/events/n1'), ev({ assignees: ['mem', 'mem2'] })));
    await assertFails(setDoc(doc(as('mem'), 'teams/A/events/n1'), ev({ assignees: [] })));
    await assertFails(setDoc(doc(as('fin'), 'teams/A/events/n1'), ev({ assignees: ['mem'], createdBy: 'fin' })));
  });
  it('admin creates an event assigned to anyone', async () => {
    await assertSucceeds(setDoc(doc(as('admin'), 'teams/A/events/n1'), ev({ assignees: ['mem', 'mem2', 'fin'], createdBy: 'admin' })));
  });
  it('createdBy must be caller; updatedAt must be request time', async () => {
    await assertFails(setDoc(doc(as('mem'), 'teams/A/events/n1'), ev({ createdBy: 'admin' })));
    await assertFails(setDoc(doc(as('mem'), 'teams/A/events/n1'), ev({ updatedAt: Timestamp.fromMillis(0) })));
  });
  it('field validation on create', async () => {
    const u = as('admin');
    const bad = [
      { title: '' }, { title: 'x'.repeat(121) }, { title: 5 },
      { date: '22-11-2026' }, { date: '2026-13-01' }, { date: 20261122 },
      { assignees: 'mem' }, { assignees: Array.from({ length: 21 }, (_, i) => `u${i}`) }, { assignees: ['mem', 7] },
      { allDay: 'no' }, { start: '7:00' }, { end: '24:00' },
      { place: 5 }, { notes: null }, { batchId: 'x'.repeat(41) }, { batchId: 3 }, { hacker: true },
    ];
    for (const b of bad) {
      await assertFails(setDoc(doc(u, 'teams/A/events/bad'), ev({ createdBy: 'admin', ...b })));
    }
    const missing: Record<string, unknown> = ev({ createdBy: 'admin' });
    delete missing.place;
    await assertFails(setDoc(doc(u, 'teams/A/events/bad'), missing));
    await assertSucceeds(setDoc(doc(u, 'teams/A/events/ok'), ev({ createdBy: 'admin', title: 'x'.repeat(120), assignees: Array.from({ length: 20 }, (_, i) => `u${i}`) })));
  });
  it('pending/outsider cannot create', async () => {
    await assertFails(setDoc(doc(as('pend'), 'teams/A/events/n1'), ev({ assignees: ['pend'], createdBy: 'pend' })));
    await assertFails(setDoc(doc(as('bMem'), 'teams/A/events/n1'), ev({ assignees: ['bMem'], createdBy: 'bMem' })));
  });

  it('assignee edits own event without changing assignees', async () => {
    await assertSucceeds(updateDoc(doc(as('mem'), 'teams/A/events/e1'), { title: 'Done', date: '2026-11-23', updatedAt: serverTimestamp() }));
  });
  it('assignee cannot change assignees', async () => {
    await assertFails(updateDoc(doc(as('mem'), 'teams/A/events/e1'), { assignees: ['mem', 'mem2'], updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('mem'), 'teams/A/events/e1'), { assignees: ['mem2'], updatedAt: serverTimestamp() }));
  });
  it('non-assignee member/finance cannot edit or delete', async () => {
    await assertFails(updateDoc(doc(as('mem'), 'teams/A/events/e2'), { title: 'x', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('fin'), 'teams/A/events/e1'), { title: 'x', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as('mem'), 'teams/A/events/e2')));
  });
  it('update must bump updatedAt, keep createdBy and pass validation', async () => {
    await assertFails(updateDoc(doc(as('mem'), 'teams/A/events/e1'), { title: 'x' }));
    await assertFails(updateDoc(doc(as('mem'), 'teams/A/events/e1'), { createdBy: 'mem', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('admin'), 'teams/A/events/e1'), { title: '', updatedAt: serverTimestamp() }));
  });
  it('admin edits assignees and deletes any event', async () => {
    await assertSucceeds(updateDoc(doc(as('admin'), 'teams/A/events/e2'), { assignees: ['mem', 'fin'], updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(as('admin'), 'teams/A/events/e1')));
  });
  it('assignee deletes own event', async () => {
    await assertSucceeds(deleteDoc(doc(as('mem'), 'teams/A/events/e1')));
  });
  it('team B admin cannot edit or delete team A events', async () => {
    await assertFails(updateDoc(doc(as('bAdmin'), 'teams/A/events/e1'), { title: 'x', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as('bAdmin'), 'teams/A/events/e1')));
  });
});

// ---------------------------------------------------------------- invoices
describe('teams/{t}/invoices', () => {
  const claim = (id: string, over: object = {}) => ({
    kind: 'claim', amountSen: 4500, date: '2026-11-15', vendor: 'Petronas', category: '燃油 Fuel', notes: '',
    photoPath: `teams/A/invoices/${id}/abc.jpg`, uploadedBy: 'mem', uploaderName: 'Mem', relatedUids: [],
    status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
  });
  const company = (id: string, over: object = {}) => {
    const c: Record<string, unknown> = claim(id, { kind: 'company', uploadedBy: 'fin', uploaderName: 'Fin', relatedUids: ['mem'], ...over });
    delete c.status;
    return c;
  };

  describe('read', () => {
    it('finance and admin read every invoice', async () => {
      for (const id of ['claimMem', 'claimMem2', 'company2', 'claimGone']) {
        await assertSucceeds(getDoc(doc(as('fin'), `teams/A/invoices/${id}`)));
        await assertSucceeds(getDoc(doc(as('admin'), `teams/A/invoices/${id}`)));
      }
      await assertSucceeds(getDocs(collection(as('fin'), 'teams/A/invoices')));
    });
    it('member reads own claims and company invoices they are ticked on', async () => {
      await assertSucceeds(getDoc(doc(as('mem'), 'teams/A/invoices/claimMem')));
      await assertSucceeds(getDoc(doc(as('mem'), 'teams/A/invoices/company1')));
      await assertSucceeds(getDocs(query(collection(as('mem'), 'teams/A/invoices'), where('uploadedBy', '==', 'mem'))));
      await assertSucceeds(getDocs(query(collection(as('mem'), 'teams/A/invoices'), where('relatedUids', 'array-contains', 'mem'))));
    });
    it('member cannot read others claims, unticked company invoices, or list all', async () => {
      await assertFails(getDoc(doc(as('mem'), 'teams/A/invoices/claimMem2')));
      await assertFails(getDoc(doc(as('mem'), 'teams/A/invoices/company2')));
      await assertFails(getDocs(collection(as('mem'), 'teams/A/invoices')));
      await assertFails(getDocs(query(collection(as('mem'), 'teams/A/invoices'), where('uploadedBy', '==', 'mem2'))));
    });
    it('pending member cannot read invoices, even if ticked or uploader', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), 'teams/A/invoices/company2'), { relatedUids: ['pend'] });
        await updateDoc(doc(ctx.firestore(), 'teams/A/invoices/claimMem2'), { uploadedBy: 'pend' });
      });
      await assertFails(getDoc(doc(as('pend'), 'teams/A/invoices/company2')));
      await assertFails(getDoc(doc(as('pend'), 'teams/A/invoices/claimMem2')));
    });
    it('removed member cannot read own past claim', async () => {
      await assertFails(getDoc(doc(as('gone'), 'teams/A/invoices/claimGone')));
      await assertFails(getDocs(query(collection(as('gone'), 'teams/A/invoices'), where('uploadedBy', '==', 'gone'))));
    });
    it('cross-team: team B admin and team A finance see nothing across', async () => {
      await assertFails(getDoc(doc(as('bAdmin'), 'teams/A/invoices/claimMem')));
      await assertFails(getDocs(collection(as('bAdmin'), 'teams/A/invoices')));
      await assertFails(getDoc(doc(as('fin'), 'teams/B/invoices/ib1')));
      await assertFails(getDoc(doc(as('admin'), 'teams/B/invoices/ib1')));
    });
    it('a member ticked across teams still needs membership', async () => {
      await env.withSecurityRulesDisabled((ctx) =>
        updateDoc(doc(ctx.firestore(), 'teams/B/invoices/ib1'), { relatedUids: ['mem'] }));
      await assertFails(getDoc(doc(as('mem'), 'teams/B/invoices/ib1')));
    });
  });

  describe('create', () => {
    it('active member creates a pending claim', async () => {
      await assertSucceeds(setDoc(doc(as('mem'), 'teams/A/invoices/c1'), claim('c1')));
      await assertSucceeds(setDoc(doc(as('mem'), 'teams/A/invoices/c2'), claim('c2', { eventId: 'e1' })));
    });
    it('finance and admin can also file claims', async () => {
      await assertSucceeds(setDoc(doc(as('fin'), 'teams/A/invoices/c1'), claim('c1', { uploadedBy: 'fin', uploaderName: 'Fin' })));
    });
    it('uploadedBy spoofing is rejected', async () => {
      await assertFails(setDoc(doc(as('mem'), 'teams/A/invoices/c1'), claim('c1', { uploadedBy: 'mem2' })));
      await assertFails(setDoc(doc(as('fin'), 'teams/A/invoices/c1'), company('c1', { uploadedBy: 'admin' })));
    });
    it('claim must start pending with no relatedUids, paidDate or rejectReason', async () => {
      const u = as('mem');
      await assertFails(setDoc(doc(u, 'teams/A/invoices/c1'), claim('c1', { status: 'reimbursed' })));
      await assertFails(setDoc(doc(u, 'teams/A/invoices/c1'), claim('c1', { status: 'rejected', rejectReason: 'x' })));
      const noStatus: Record<string, unknown> = claim('c1');
      delete noStatus.status;
      await assertFails(setDoc(doc(u, 'teams/A/invoices/c1'), noStatus));
      await assertFails(setDoc(doc(u, 'teams/A/invoices/c1'), claim('c1', { relatedUids: ['mem2'] })));
      await assertFails(setDoc(doc(u, 'teams/A/invoices/c1'), claim('c1', { paidDate: '2026-11-15' })));
      await assertFails(setDoc(doc(u, 'teams/A/invoices/c1'), claim('c1', { rejectReason: 'x' })));
    });
    it('amountSen must be an integer 1..100000000', async () => {
      const u = as('mem');
      for (const amountSen of [0, -5, 12.5, 100000001, '4500', null]) {
        await assertFails(setDoc(doc(u, 'teams/A/invoices/c1'), claim('c1', { amountSen })));
      }
      await assertSucceeds(setDoc(doc(u, 'teams/A/invoices/c1'), claim('c1', { amountSen: 1 })));
      await assertSucceeds(setDoc(doc(u, 'teams/A/invoices/c2'), claim('c2', { amountSen: 100000000 })));
    });
    it('field validation: date, strings, photoPath, timestamps, extra keys', async () => {
      const u = as('mem');
      const bad = [
        { date: '15/11/2026' }, { vendor: 5 }, { vendor: 'x'.repeat(121) }, { category: 1 }, { notes: 'x'.repeat(1001) },
        { uploaderName: '' }, { photoPath: 'teams/A/invoices/other/abc.jpg' }, { photoPath: 'teams/B/invoices/c1/abc.jpg' },
        { photoPath: 'teams/A/invoices/c1/a/b.jpg' }, { photoPath: '' }, { eventId: 5 },
        { createdAt: Timestamp.fromMillis(0) }, { updatedAt: Timestamp.fromMillis(0) }, { approvedBy: 'admin' },
      ];
      for (const b of bad) await assertFails(setDoc(doc(u, 'teams/A/invoices/c1'), claim('c1', b)));
      const missing: Record<string, unknown> = claim('c1');
      delete missing.photoPath;
      await assertFails(setDoc(doc(u, 'teams/A/invoices/c1'), missing));
    });
    it('company invoice: finance/admin only, no status', async () => {
      await assertSucceeds(setDoc(doc(as('fin'), 'teams/A/invoices/k1'), company('k1')));
      await assertSucceeds(setDoc(doc(as('admin'), 'teams/A/invoices/k2'), company('k2', { uploadedBy: 'admin', relatedUids: [] })));
      await assertFails(setDoc(doc(as('mem'), 'teams/A/invoices/k3'), company('k3', { uploadedBy: 'mem' })));
      await assertFails(setDoc(doc(as('fin'), 'teams/A/invoices/k4'), { ...company('k4'), status: 'pending' }));
      await assertFails(setDoc(doc(as('fin'), 'teams/A/invoices/k5'), { ...company('k5'), paidDate: '2026-11-15' }));
      await assertFails(setDoc(doc(as('fin'), 'teams/A/invoices/k6'), company('k6', { relatedUids: Array.from({ length: 21 }, (_, i) => `u${i}`) })));
      await assertFails(setDoc(doc(as('fin'), 'teams/A/invoices/k7'), company('k7', { relatedUids: [1] })));
    });
    it('bad kind rejected', async () => {
      await assertFails(setDoc(doc(as('fin'), 'teams/A/invoices/k1'), { ...company('k1'), kind: 'other' }));
    });
    it('pending, removed and outsiders cannot create', async () => {
      await assertFails(setDoc(doc(as('pend'), 'teams/A/invoices/c1'), claim('c1', { uploadedBy: 'pend' })));
      await assertFails(setDoc(doc(as('gone'), 'teams/A/invoices/c1'), claim('c1', { uploadedBy: 'gone' })));
      await assertFails(setDoc(doc(as('bAdmin'), 'teams/A/invoices/k1'), company('k1', { uploadedBy: 'bAdmin' })));
    });
  });

  describe('update', () => {
    const t = () => ({ updatedAt: serverTimestamp() });

    it('owner edits a pending claim', async () => {
      await assertSucceeds(updateDoc(doc(as('mem'), 'teams/A/invoices/claimMem'), { amountSen: 9900, vendor: 'Shell', photoPath: 'teams/A/invoices/claimMem/p2.jpg', ...t() }));
    });
    it('owner resubmits a rejected claim (rejected -> pending, clears reason)', async () => {
      await assertSucceeds(updateDoc(doc(as('mem'), 'teams/A/invoices/claimMemRej'), { status: 'pending', rejectReason: deleteField(), amountSen: 100, ...t() }));
    });
    it('owner may resubmit keeping the old reason, or edit while still rejected', async () => {
      await assertSucceeds(updateDoc(doc(as('mem'), 'teams/A/invoices/claimMemRej'), { notes: 'better photo', ...t() }));
      await assertSucceeds(updateDoc(doc(as('mem'), 'teams/A/invoices/claimMemRej'), { status: 'pending', ...t() }));
    });
    it('owner cannot set status reimbursed/rejected or touch a reimbursed claim', async () => {
      await assertFails(updateDoc(doc(as('mem'), 'teams/A/invoices/claimMem'), { status: 'reimbursed', ...t() }));
      await assertFails(updateDoc(doc(as('mem'), 'teams/A/invoices/claimMem'), { status: 'rejected', ...t() }));
      await assertFails(updateDoc(doc(as('mem'), 'teams/A/invoices/claimMemRej'), { status: 'reimbursed', ...t() }));
      await assertFails(updateDoc(doc(as('mem'), 'teams/A/invoices/claimMemPaid'), { amountSen: 999999, ...t() }));
      await assertFails(updateDoc(doc(as('mem'), 'teams/A/invoices/claimMemPaid'), { status: 'pending', ...t() }));
    });
    it('owner cannot set paidDate, rejectReason, relatedUids, kind, uploadedBy, createdAt or uploaderName', async () => {
      const r = doc(as('mem'), 'teams/A/invoices/claimMem');
      await assertFails(updateDoc(r, { paidDate: '2026-11-15', ...t() }));
      await assertFails(updateDoc(r, { rejectReason: 'self', ...t() }));
      await assertFails(updateDoc(doc(as('mem'), 'teams/A/invoices/claimMemRej'), { rejectReason: 'changed', ...t() }));
      await assertFails(updateDoc(r, { relatedUids: ['mem2'], ...t() }));
      await assertFails(updateDoc(r, { kind: 'company', ...t() }));
      await assertFails(updateDoc(r, { uploadedBy: 'mem2', ...t() }));
      await assertFails(updateDoc(r, { createdAt: serverTimestamp(), ...t() }));
      await assertFails(updateDoc(r, { uploaderName: 'Boss', ...t() }));
    });
    it('owner edit must bump updatedAt and stay valid', async () => {
      const r = doc(as('mem'), 'teams/A/invoices/claimMem');
      await assertFails(updateDoc(r, { amountSen: 10 }));
      await assertFails(updateDoc(r, { amountSen: 0, ...t() }));
      await assertFails(updateDoc(r, { amountSen: 1.5, ...t() }));
      await assertFails(updateDoc(r, { photoPath: 'teams/A/invoices/claimMem2/p1.jpg', ...t() }));
    });
    it('other members cannot edit someone elses claim', async () => {
      await assertFails(updateDoc(doc(as('mem2'), 'teams/A/invoices/claimMem'), { amountSen: 1, ...t() }));
      await assertFails(updateDoc(doc(as('mem'), 'teams/A/invoices/company1'), { amountSen: 1, ...t() }));
    });
    it('removed owner cannot edit own claim', async () => {
      await assertFails(updateDoc(doc(as('gone'), 'teams/A/invoices/claimGone'), { amountSen: 1, ...t() }));
    });

    it('finance marks reimbursed with optional paidDate', async () => {
      await assertSucceeds(updateDoc(doc(as('fin'), 'teams/A/invoices/claimMem'), { status: 'reimbursed', paidDate: '2026-11-16', ...t() }));
      await assertSucceeds(updateDoc(doc(as('admin'), 'teams/A/invoices/claimMem2'), { status: 'reimbursed', ...t() }));
    });
    it('finance rejects with a reason', async () => {
      await assertSucceeds(updateDoc(doc(as('fin'), 'teams/A/invoices/claimMem'), { status: 'rejected', rejectReason: 'Receipt unreadable', ...t() }));
    });
    it('finance reimbursing a rejected claim must clear the reason', async () => {
      await assertFails(updateDoc(doc(as('fin'), 'teams/A/invoices/claimMemRej'), { status: 'reimbursed', ...t() }));
      await assertSucceeds(updateDoc(doc(as('fin'), 'teams/A/invoices/claimMemRej'), { status: 'reimbursed', rejectReason: deleteField(), ...t() }));
    });
    it('reject requires a non-empty reason <= 300', async () => {
      const r = doc(as('fin'), 'teams/A/invoices/claimMem');
      await assertFails(updateDoc(r, { status: 'rejected', ...t() }));
      await assertFails(updateDoc(r, { status: 'rejected', rejectReason: '', ...t() }));
      await assertFails(updateDoc(r, { status: 'rejected', rejectReason: '   ', ...t() }));
      await assertFails(updateDoc(r, { status: 'rejected', rejectReason: 'x'.repeat(301), ...t() }));
      await assertSucceeds(updateDoc(r, { status: 'rejected', rejectReason: 'x'.repeat(300), ...t() }));
    });
    it('finance cannot set bad paidDate, pending status, or rejected with paidDate', async () => {
      const r = doc(as('fin'), 'teams/A/invoices/claimMem');
      await assertFails(updateDoc(r, { status: 'reimbursed', paidDate: '16/11/2026', ...t() }));
      await assertFails(updateDoc(r, { status: 'pending', ...t() }));
      await assertFails(updateDoc(r, { status: 'rejected', rejectReason: 'no', paidDate: '2026-11-16', ...t() }));
      await assertFails(updateDoc(r, { status: 'reimbursed', rejectReason: 'why', ...t() }));
    });
    it('finance processing cannot change amount or other fields of a claim', async () => {
      const r = doc(as('fin'), 'teams/A/invoices/claimMem');
      await assertFails(updateDoc(r, { status: 'reimbursed', amountSen: 1, ...t() }));
      await assertFails(updateDoc(r, { status: 'reimbursed', uploadedBy: 'fin', ...t() }));
      await assertFails(updateDoc(r, { status: 'reimbursed' }));
    });
    it('plain member cannot process claims', async () => {
      await assertFails(updateDoc(doc(as('mem2'), 'teams/A/invoices/claimMem'), { status: 'reimbursed', ...t() }));
      await assertFails(updateDoc(doc(as('mem'), 'teams/A/invoices/claimMem2'), { status: 'rejected', rejectReason: 'x', ...t() }));
    });
    it('finance of team A cannot process team B claims', async () => {
      await assertFails(updateDoc(doc(as('fin'), 'teams/B/invoices/ib1'), { status: 'reimbursed', ...t() }));
    });
    it('finance edits a company invoice but cannot add status or change kind/uploader', async () => {
      const r = doc(as('fin'), 'teams/A/invoices/company2');
      await assertSucceeds(updateDoc(r, { amountSen: 777, relatedUids: ['mem2'], ...t() }));
      await assertFails(updateDoc(r, { status: 'reimbursed', ...t() }));
      await assertFails(updateDoc(r, { kind: 'claim', status: 'pending', ...t() }));
      await assertFails(updateDoc(r, { uploadedBy: 'admin', ...t() }));
      await assertFails(updateDoc(doc(as('mem'), 'teams/A/invoices/company1'), { relatedUids: ['mem', 'mem2'], ...t() }));
    });
  });

  describe('delete', () => {
    it('owner deletes own pending or rejected claim', async () => {
      await assertSucceeds(deleteDoc(doc(as('mem'), 'teams/A/invoices/claimMem')));
      await assertSucceeds(deleteDoc(doc(as('mem'), 'teams/A/invoices/claimMemRej')));
    });
    it('owner cannot delete a reimbursed claim', async () => {
      await assertFails(deleteDoc(doc(as('mem'), 'teams/A/invoices/claimMemPaid')));
    });
    it('member cannot delete others claims or company invoices', async () => {
      await assertFails(deleteDoc(doc(as('mem2'), 'teams/A/invoices/claimMem')));
      await assertFails(deleteDoc(doc(as('mem'), 'teams/A/invoices/company1')));
    });
    it('removed owner cannot delete', async () => {
      await assertFails(deleteDoc(doc(as('gone'), 'teams/A/invoices/claimGone')));
    });
    it('finance and admin delete any invoice', async () => {
      await assertSucceeds(deleteDoc(doc(as('fin'), 'teams/A/invoices/claimMemPaid')));
      await assertSucceeds(deleteDoc(doc(as('admin'), 'teams/A/invoices/company1')));
    });
    it('team B admin cannot delete team A invoices', async () => {
      await assertFails(deleteDoc(doc(as('bAdmin'), 'teams/A/invoices/claimMem')));
    });
  });
});

// ---------------------------------------------------------------- backend-only collections
describe('backend-only collections', () => {
  it('inviteCodes: no client read or write (even admin)', async () => {
    await assertFails(getDoc(doc(as('admin'), 'inviteCodes/TANA-AAAA')));
    await assertFails(getDocs(query(collection(as('admin'), 'inviteCodes'), where('teamId', '==', 'A'))));
    await assertFails(setDoc(doc(as('admin'), 'inviteCodes/TANA-BBBB'), { teamId: 'A' }));
    await assertFails(deleteDoc(doc(as('admin'), 'inviteCodes/TANA-AAAA')));
  });
  it('phoneInvites: admin of its team may read; no one may write', async () => {
    await assertSucceeds(getDoc(doc(as('admin'), `phoneInvites/A_${PHONE}`)));
    await assertSucceeds(getDocs(query(collection(as('admin'), 'phoneInvites'), where('teamId', '==', 'A'))));
    await assertFails(setDoc(doc(as('admin'), 'phoneInvites/A_+60100000000'), { teamId: 'A', teamName: 'A', phone: '+60100000000', name: 'x', role: 'admin', createdBy: 'admin', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('admin'), `phoneInvites/A_${PHONE}`), { role: 'admin' }));
    await assertFails(deleteDoc(doc(as('admin'), `phoneInvites/A_${PHONE}`)));
  });
  it('phoneInvites: non-admins and other-team admins cannot read', async () => {
    await assertFails(getDoc(doc(as('fin'), `phoneInvites/A_${PHONE}`)));
    await assertFails(getDoc(doc(as('mem'), `phoneInvites/A_${PHONE}`)));
    await assertFails(getDoc(doc(as('admin'), `phoneInvites/B_${PHONE}`)));
    await assertFails(getDoc(doc(as('bAdmin'), `phoneInvites/A_${PHONE}`)));
    await assertFails(getDocs(collection(as('admin'), 'phoneInvites')));
    await assertFails(getDocs(query(collection(as('admin'), 'phoneInvites'), where('teamId', '==', 'B'))));
    // the invited person themself cannot read it either
    await assertFails(getDoc(doc(as('newU', PHONE), `phoneInvites/A_${PHONE}`)));
  });
  it('rateLimits and digestSent: no client access', async () => {
    await assertFails(getDoc(doc(as('mem', PHONE), 'rateLimits/otp_abc')));
    await assertFails(setDoc(doc(as('mem', PHONE), 'rateLimits/otp_abc'), { count: 0 }));
    await assertFails(deleteDoc(doc(as('mem', PHONE), 'rateLimits/otp_abc')));
    await assertFails(getDoc(doc(as('mem'), 'digestSent/mem_2026-11-16')));
    await assertFails(setDoc(doc(as('mem'), 'digestSent/mem_2026-11-17'), { at: serverTimestamp() }));
  });
  it('unknown top-level collections are denied', async () => {
    await assertFails(getDoc(doc(as('admin'), 'notifyBatches/x')));
    await assertFails(setDoc(doc(as('admin'), 'anything/x'), { a: 1 }));
  });
});
