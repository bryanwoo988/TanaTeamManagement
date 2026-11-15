import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { clearDb, db } from './helpers';

const bucket = () => getStorage().bucket('demo-tana.appspot.com');
const T = 't1';
const path = (inv: string, f: string) => `teams/${T}/invoices/${inv}/${f}.jpg`;
async function waitFor(fn: () => Promise<boolean>, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
}
const exists = async (p: string) => (await bucket().file(p).exists())[0];
const put = (p: string) => bucket().file(p).save(Buffer.from([0xff, 0xd8, 0xff]), { contentType: 'image/jpeg' });
const doc = (photoPath: string) => ({ kind: 'claim', amountSen: 100, date: '2026-11-15', vendor: '', category: '', notes: '', photoPath,
  uploadedBy: 'bob', uploaderName: 'Bob', relatedUids: [], status: 'pending', createdAt: Timestamp.now(), updatedAt: Timestamp.now() });

beforeEach(async () => {
  await clearDb();
  await db.doc(`teams/${T}`).set({ name: 'East Farm', createdBy: 'alice', categories: [], createdAt: Timestamp.now() });
});

describe('invoice photo cleanup', () => {
  it('deleting the invoice deletes its Storage photo', async () => {
    const p = path('d1', 'a');
    await put(p);
    await db.doc(`teams/${T}/invoices/d1`).set(doc(p));
    await new Promise((r) => setTimeout(r, 1500));
    expect(await exists(p)).toBe(true); // create alone keeps it
    await db.doc(`teams/${T}/invoices/d1`).delete();
    expect(await waitFor(async () => !(await exists(p)))).toBe(true);
  });

  it('changing photoPath deletes the old photo and keeps the new one', async () => {
    const a = path('r1', 'a');
    const b = path('r1', 'b');
    await put(a);
    await put(b);
    await db.doc(`teams/${T}/invoices/r1`).set(doc(a));
    await db.doc(`teams/${T}/invoices/r1`).update({ photoPath: b, updatedAt: Timestamp.now() });
    expect(await waitFor(async () => !(await exists(a)))).toBe(true);
    expect(await exists(b)).toBe(true);
  });

  it('an update that keeps photoPath deletes nothing', async () => {
    const a = path('k1', 'a');
    await put(a);
    await db.doc(`teams/${T}/invoices/k1`).set(doc(a));
    await db.doc(`teams/${T}/invoices/k1`).update({ amountSen: 200 });
    await new Promise((r) => setTimeout(r, 2500));
    expect(await exists(a)).toBe(true);
  });
});
