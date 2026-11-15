import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { call, clearAuth, clearDb, db } from './helpers';

type U = { uid: string; phone: string };
const alice: U = { uid: 'alice', phone: '+60120000001' };
const bob: U = { uid: 'bob', phone: '+60120000002' };
const carol: U = { uid: 'carol', phone: '+60120000003' };
const as = (u: U) => ({ call: <T = any>(name: string, data: unknown) => call<T>(name, data, u) });

async function seedUser(u: U, name: string) {
  await getAuth().createUser({ uid: u.uid, phoneNumber: u.phone });
  await db.doc(`users/${u.uid}`).set({ name, phone: u.phone, lang: 'en', notify: {}, digestTime: '08:00', createdAt: Timestamp.now() });
}

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 15000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (ok(v) || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
}
const userTeam = async (uid: string, teamId: string) => (await db.doc(`users/${uid}/teams/${teamId}`).get());

beforeEach(async () => {
  await clearDb();
  await clearAuth();
  await seedUser(alice, 'Alice');
  await seedUser(bob, 'Bob');
  await seedUser(carol, 'Carol');
});

describe('team functions', () => {
  it('requires a profile', async () => {
    await expect(call('createTeam', { name: 'X' }, { uid: 'ghost' })).rejects.toMatchObject({ message: 'profile.missing' });
    await expect(call('createTeam', { name: 'X' })).rejects.toBeTruthy();
  });

  it('validates the team name', async () => {
    await expect(as(alice).call('createTeam', { name: '   ' })).rejects.toMatchObject({ status: 'INVALID_ARGUMENT' });
    await expect(as(alice).call('createTeam', { name: 'x'.repeat(61) })).rejects.toMatchObject({ status: 'INVALID_ARGUMENT' });
  });

  it('creates a team with admin member, categories and invite code', async () => {
    const { teamId, code } = await as(alice).call('createTeam', { name: '  East Farm ' });
    expect(code).toMatch(/^TANA-/);
    expect((await db.doc(`teams/${teamId}`).get()).data()).toMatchObject({ name: 'East Farm', createdBy: 'alice' });
    expect((await db.doc(`teams/${teamId}`).get()).data()!.categories.length).toBe(6);
    expect((await db.doc(`teams/${teamId}/members/alice`).get()).data()).toMatchObject({ role: 'admin', status: 'active', name: 'Alice' });
    expect((await db.doc(`inviteCodes/${code}`).get()).data()).toMatchObject({ teamId });
  });

  it('join, reset and permissions flow', async () => {
    const { teamId, code } = await as(alice).call('createTeam', { name: 'East Farm' });
    expect(await as(bob).call('joinTeam', { code: code.toLowerCase().replace('tana-', '') })).toEqual({ teamId, status: 'pending' });
    // already a member: unchanged
    expect(await as(bob).call('joinTeam', { code })).toEqual({ teamId, status: 'pending' });
    expect(await as(alice).call('joinTeam', { code })).toEqual({ teamId, status: 'active' });
    await expect(as(bob).call('joinTeam', { code: 'TANA-ZZZZ' })).rejects.toMatchObject({ message: 'team.badCode' });
    await expect(as(bob).call('resetInviteCode', { teamId })).rejects.toMatchObject({ status: 'PERMISSION_DENIED' });
    await expect(as(bob).call('getInviteCode', { teamId })).rejects.toMatchObject({ status: 'PERMISSION_DENIED' });
    expect((await as(alice).call('getInviteCode', { teamId })).code).toBe(code);
    const { code: code2 } = await as(alice).call('resetInviteCode', { teamId });
    expect(code2).not.toBe(code);
    expect((await db.doc(`inviteCodes/${code}`).get()).exists).toBe(false);
    await expect(as(carol).call('joinTeam', { code })).rejects.toMatchObject({ message: 'team.badCode' });
    expect((await as(carol).call('joinTeam', { code: code2 })).status).toBe('pending');
  });

  it('adds by phone: registered becomes active, unknown becomes an invite, which can be cancelled', async () => {
    const { teamId } = await as(alice).call('createTeam', { name: 'East Farm' });
    expect(await as(alice).call('addMemberByPhone', { teamId, phone: '012-000 0003', name: 'C', role: 'finance' })).toEqual({ status: 'added' });
    expect((await db.doc(`teams/${teamId}/members/carol`).get()).data()).toMatchObject({ role: 'finance', status: 'active', name: 'Carol' });
    expect(await as(alice).call('addMemberByPhone', { teamId, phone: '0127770000', name: 'D', role: 'member' })).toEqual({ status: 'invited' });
    expect((await db.doc(`phoneInvites/${teamId}_+60127770000`).get()).data()).toMatchObject({ teamId, teamName: 'East Farm', phone: '+60127770000', name: 'D', role: 'member', createdBy: 'alice' });
    await expect(as(bob).call('addMemberByPhone', { teamId, phone: '0127770001', name: 'E', role: 'member' })).rejects.toMatchObject({ status: 'PERMISSION_DENIED' });
    await expect(as(alice).call('addMemberByPhone', { teamId, phone: '0312345678', name: 'E', role: 'member' })).rejects.toMatchObject({ message: 'login.invalidPhone' });
    await as(alice).call('cancelPhoneInvite', { teamId, phone: '0127770000' });
    expect((await db.doc(`phoneInvites/${teamId}_+60127770000`).get()).exists).toBe(false);
  });

  it('adds an Auth-only user (no profile doc) directly with the admin-given name', async () => {
    const { teamId } = await as(alice).call('createTeam', { name: 'East Farm' });
    const u = await getAuth().createUser({ phoneNumber: '+60125550000' });
    expect(await as(alice).call('addMemberByPhone', { teamId, phone: '0125550000', name: 'Dan', role: 'member' })).toEqual({ status: 'added' });
    expect((await db.doc(`teams/${teamId}/members/${u.uid}`).get()).data()).toMatchObject({ name: 'Dan', status: 'active', role: 'member' });
  });

  it('addMemberByPhone activates an existing pending member', async () => {
    const { teamId, code } = await as(alice).call('createTeam', { name: 'East Farm' });
    await as(bob).call('joinTeam', { code });
    expect(await as(alice).call('addMemberByPhone', { teamId, phone: bob.phone, name: 'B', role: 'finance' })).toEqual({ status: 'added' });
    expect((await db.doc(`teams/${teamId}/members/bob`).get()).data()).toMatchObject({ status: 'active', role: 'finance' });
  });

  it('cancelPhoneInvite is admin only', async () => {
    const { teamId } = await as(alice).call('createTeam', { name: 'East Farm' });
    await expect(as(bob).call('cancelPhoneInvite', { teamId, phone: '0127770000' })).rejects.toMatchObject({ status: 'PERMISSION_DENIED' });
  });

  it('a non-last admin can leave', async () => {
    const { teamId } = await as(alice).call('createTeam', { name: 'East Farm' });
    await db.doc(`teams/${teamId}/members/bob`).set({ uid: 'bob', name: 'Bob', role: 'admin', status: 'active', joinedAt: Timestamp.now() });
    await as(alice).call('leaveTeam', { teamId });
    expect((await db.doc(`teams/${teamId}/members/alice`).get()).exists).toBe(false);
  });

  it('leaveTeam refuses the last admin but lets others leave', async () => {
    const { teamId, code } = await as(alice).call('createTeam', { name: 'East Farm' });
    await as(bob).call('joinTeam', { code });
    await expect(as(alice).call('leaveTeam', { teamId })).rejects.toMatchObject({ message: 'team.lastAdmin' });
    await as(bob).call('leaveTeam', { teamId });
    expect((await db.doc(`teams/${teamId}/members/bob`).get()).exists).toBe(false);
  });
});

describe('onMemberWrite', () => {
  it('mirrors members to users/{uid}/teams and removes on delete', async () => {
    const { teamId, code } = await as(alice).call('createTeam', { name: 'East Farm' });
    await as(bob).call('joinTeam', { code });
    const s = await waitFor(() => userTeam(bob.uid, teamId), (d) => d.exists);
    expect(s.data()).toMatchObject({ teamId, status: 'pending', name: 'East Farm', role: 'member' });
    expect((await waitFor(() => userTeam(alice.uid, teamId), (d) => d.exists)).data()).toMatchObject({ role: 'admin', status: 'active' });
    await db.doc(`teams/${teamId}/members/bob`).update({ status: 'active' });
    expect((await waitFor(() => userTeam(bob.uid, teamId), (d) => d.get('status') === 'active')).get('status')).toBe('active');
    await db.doc(`teams/${teamId}/members/bob`).delete();
    expect((await waitFor(() => userTeam(bob.uid, teamId), (d) => !d.exists)).exists).toBe(false);
  });
});

describe('member names follow the profile', () => {
  const member = (teamId: string, uid: string) => db.doc(`teams/${teamId}/members/${uid}`).get();

  it('an invited number: first login, then profile setup, replaces the admin-entered name', async () => {
    const { teamId } = await as(alice).call('createTeam', { name: 'East Farm' });
    await as(alice).call('addMemberByPhone', { teamId, phone: '0127770000', name: 'Admin Typed', role: 'member' });
    await call('requestLoginCode', { phone: '0127770000' });
    const { uid } = await call('verifyLoginCode', { phone: '0127770000', code: '123456' });
    expect((await member(teamId, uid)).get('name')).toBe('Admin Typed');
    await db.doc(`users/${uid}`).set({ name: 'Real Name', phone: '+60127770000', lang: 'en', notify: {}, digestTime: '20:00', createdAt: Timestamp.now() });
    expect((await waitFor(() => member(teamId, uid), (d) => d.get('name') === 'Real Name')).get('name')).toBe('Real Name');
  });

  it('an Auth-only user added by phone gets their own name once they set up a profile', async () => {
    const { teamId } = await as(alice).call('createTeam', { name: 'East Farm' });
    const u = await getAuth().createUser({ phoneNumber: '+60125550000' });
    await as(alice).call('addMemberByPhone', { teamId, phone: '0125550000', name: 'Dan', role: 'member' });
    await db.doc(`users/${u.uid}`).set({ name: 'Daniel Lee', phone: '+60125550000', lang: 'en', notify: {}, digestTime: '20:00', createdAt: Timestamp.now() });
    expect((await waitFor(() => member(teamId, u.uid), (d) => d.get('name') === 'Daniel Lee')).get('name')).toBe('Daniel Lee');
  });

  it('renaming the profile renames every membership', async () => {
    const a = await as(alice).call('createTeam', { name: 'East Farm' });
    const b = await as(bob).call('createTeam', { name: 'West Farm' });
    await as(bob).call('addMemberByPhone', { teamId: b.teamId, phone: alice.phone, name: 'A', role: 'member' });
    await waitFor(() => userTeam(alice.uid, b.teamId), (d) => d.exists);
    await waitFor(() => userTeam(alice.uid, a.teamId), (d) => d.exists);
    await db.doc('users/alice').update({ name: 'Alice Tan' });
    expect((await waitFor(() => member(a.teamId, 'alice'), (d) => d.get('name') === 'Alice Tan')).get('name')).toBe('Alice Tan');
    expect((await waitFor(() => member(b.teamId, 'alice'), (d) => d.get('name') === 'Alice Tan')).get('name')).toBe('Alice Tan');
  });
});

describe('onMemberWrite mirrors canUpload', () => {
  it('copies canUpload when present and omits it when absent', async () => {
    const { teamId } = await as(alice).call('createTeam', { name: 'East Farm' });
    await as(alice).call('addMemberByPhone', { teamId, phone: bob.phone, name: 'Bob', role: 'member' });
    const first = await waitFor(() => userTeam(bob.uid, teamId), (d) => d.exists);
    expect(first.data()).not.toHaveProperty('canUpload');
    await db.doc(`teams/${teamId}/members/bob`).update({ canUpload: false });
    expect((await waitFor(() => userTeam(bob.uid, teamId), (d) => d.get('canUpload') === false)).get('canUpload')).toBe(false);
    await db.doc(`teams/${teamId}/members/bob`).update({ canUpload: true });
    expect((await waitFor(() => userTeam(bob.uid, teamId), (d) => d.get('canUpload') === true)).get('canUpload')).toBe(true);
  });
});
