import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { call, clearDb, db } from './helpers';

const keys = { p256dh: 'k', auth: 'a' };
async function seedUser(uid: string, lang = 'en') {
  await db.doc(`users/${uid}`).set({ name: uid, phone: '+6012000000' + uid.length, lang, notify: {}, digestTime: '20:00', createdAt: Timestamp.now() });
}
async function seedSub(uid: string, id: string, endpoint: string) {
  await db.doc(`users/${uid}/pushSubs/${id}`).set({ endpoint, keys, ua: 'x', createdAt: Timestamp.now() });
}
const pushLog = async () => (await db.collection('_pushLog').get()).docs.map((d) => d.data());

beforeEach(async () => {
  await clearDb();
  await seedUser('bob');
  await seedUser('carol');
});

describe('getPushConfig', () => {
  it('requires sign-in', async () => {
    await expect(call('getPushConfig', {})).rejects.toMatchObject({ status: 'UNAUTHENTICATED' });
  });
  it('returns the server VAPID public key', async () => {
    const r = await call<{ vapidPublicKey: string }>('getPushConfig', {}, { uid: 'bob' });
    expect(r.vapidPublicKey).toMatch(/^B[0-9A-Za-z_-]{86}$/);
  });
});

describe('sendTestPush', () => {
  it('requires sign-in', async () => {
    await expect(call('sendTestPush', {})).rejects.toMatchObject({ status: 'UNAUTHENTICATED' });
  });

  it('pushes to the caller\'s devices only, reports each by host, and deletes gone subscriptions', async () => {
    await db.doc('users/bob').update({ lang: 'ms' });
    await seedSub('bob', 'ok', 'https://fcm.googleapis.com/fcm/send/ok-1');
    await seedSub('bob', 'gone', 'https://web.push.apple.com/gone/1');
    await seedSub('carol', 'c1', 'https://fcm.googleapis.com/fcm/send/carol');
    const r = await call<{ results: { host: string; ok: boolean; statusCode?: number }[] }>('sendTestPush', {}, { uid: 'bob' });
    const byHost = Object.fromEntries(r.results.map((x) => [x.host, x]));
    expect(r.results).toHaveLength(2);
    expect(byHost['fcm.googleapis.com']).toMatchObject({ ok: true });
    expect(byHost['web.push.apple.com']).toMatchObject({ ok: false, statusCode: 410 });
    expect(JSON.stringify(r)).not.toContain('/fcm/send/');
    expect((await db.doc('users/bob/pushSubs/gone').get()).exists).toBe(false);
    expect((await db.doc('users/bob/pushSubs/ok').get()).exists).toBe(true);
    const log = await pushLog();
    expect(log).toHaveLength(1);
    expect(log[0].uid).toBe('bob');
    const p = JSON.parse(log[0].payload);
    expect(p).toMatchObject({ url: '/settings', tag: 'test', kind: 'test' });
    expect(p.title).toBe('Notifikasi ujian');
    expect((await db.collection('users/bob/notifications').get()).empty).toBe(true);
  });

  it('returns no results when the caller has no device registered', async () => {
    const r = await call<{ results: unknown[] }>('sendTestPush', {}, { uid: 'bob' });
    expect(r.results).toEqual([]);
  });
});
