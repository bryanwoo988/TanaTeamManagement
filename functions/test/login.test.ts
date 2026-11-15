import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { call, clearAuth, clearDb, db } from './helpers';

const CODE = '123456';

beforeEach(async () => {
  await clearDb();
  await clearAuth();
});

describe('requestLoginCode', () => {
  it('accepts a differently typed Malaysian mobile', async () => {
    expect(await call('requestLoginCode', { phone: '012-345 6789' })).toEqual({ sent: true });
  });

  it('allows 5 per day then refuses the 6th', async () => {
    await call('requestLoginCode', { phone: '012-345 6789' });
    for (let i = 0; i < 4; i++) await call('requestLoginCode', { phone: '0123456789' });
    await expect(call('requestLoginCode', { phone: '0123456789' })).rejects.toMatchObject({ message: 'login.tooMany' });
    await expect(call('requestLoginCode', { phone: '0177654321' })).resolves.toEqual({ sent: true });
  });

  it('rejects landlines', async () => {
    await expect(call('requestLoginCode', { phone: '0312345678' })).rejects.toMatchObject({ message: 'login.invalidPhone' });
  });

  it('does not store the phone number in the rate-limit record', async () => {
    await call('requestLoginCode', { phone: '0123456789' });
    const ids = (await db.collection('rateLimits').get()).docs.map((d) => d.id).join(',');
    expect(ids).not.toContain('123456789');
  });
});

describe('verifyLoginCode', () => {
  it('rejects without a requested code', async () => {
    await expect(call('verifyLoginCode', { phone: '0129999999', code: '000000' })).rejects.toBeTruthy();
  });

  it('rejects a wrong code, accepts the right one and returns a token', async () => {
    await call('requestLoginCode', { phone: '0129999999' });
    await expect(call('verifyLoginCode', { phone: '0129999999', code: '000000' })).rejects.toMatchObject({ message: 'login.wrongCode' });
    const r = await call('verifyLoginCode', { phone: '+60129999999', code: CODE });
    expect(r.uid).toBeTruthy();
    expect(typeof r.token).toBe('string');
    // same number logs into the same account next time
    await call('requestLoginCode', { phone: '0129999999' });
    expect((await call('verifyLoginCode', { phone: '0129999999', code: CODE })).uid).toBe(r.uid);
  });

  it('attaches a phone invite typed differently on first login', async () => {
    await db.doc('phoneInvites/t1_+60121112222').set({
      teamId: 't1', teamName: 'East', phone: '+60121112222', name: 'Amin', role: 'member', createdBy: 'boss', createdAt: Timestamp.now(),
    });
    await call('requestLoginCode', { phone: '012-111 2222' });
    const r = await call('verifyLoginCode', { phone: '012-111 2222', code: CODE });
    expect((await db.doc(`teams/t1/members/${r.uid}`).get()).data()).toMatchObject({ uid: r.uid, role: 'member', status: 'active', name: 'Amin' });
    expect((await db.doc(`users/${r.uid}/teams/t1`).get()).data()).toMatchObject({ teamId: 't1', name: 'East', role: 'member', status: 'active' });
    expect((await db.doc('phoneInvites/t1_+60121112222').get()).exists).toBe(false);
  });

  it('prefers the user profile name and claims invites added after first login', async () => {
    await call('requestLoginCode', { phone: '0121112222' });
    const r = await call('verifyLoginCode', { phone: '0121112222', code: CODE });
    await db.doc(`users/${r.uid}`).set({ name: 'Real Name' });
    await db.doc('phoneInvites/t2_+60121112222').set({
      teamId: 't2', teamName: 'West', phone: '+60121112222', name: 'Invite Name', role: 'manager', createdBy: 'boss', createdAt: Timestamp.now(),
    });
    await call('requestLoginCode', { phone: '0121112222' });
    await call('verifyLoginCode', { phone: '0121112222', code: CODE });
    expect((await db.doc(`teams/t2/members/${r.uid}`).get()).data()).toMatchObject({ role: 'manager', name: 'Real Name' });
    expect((await db.doc('phoneInvites/t2_+60121112222').get()).exists).toBe(false);
  });
});

describe('phone change', () => {
  it('changes the phone after a code to the new number', async () => {
    await call('requestLoginCode', { phone: '0121112222' });
    const r = await call('verifyLoginCode', { phone: '0121112222', code: CODE });
    const auth = { uid: r.uid, phone: '+60121112222' };
    await expect(call('requestPhoneChangeCode', { phone: '0121112222' }, auth)).rejects.toMatchObject({ message: 'phone.same' });
    expect(await call('requestPhoneChangeCode', { phone: '0133334444' }, auth)).toEqual({ sent: true });
    expect(await call('confirmPhoneChange', { phone: '0133334444', code: CODE }, auth)).toEqual({ phone: '+60133334444' });
    await call('requestLoginCode', { phone: '0133334444' });
    expect((await call('verifyLoginCode', { phone: '0133334444', code: CODE })).uid).toBe(r.uid);
  });
});
