import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
// The exact field maps the app writes (src/invoice/data.ts builds its writes from these).
import { createFields, rejectFields, reimburseFields, resubmitFields, updateFields } from '../src/invoice/payload';
import type { InvoiceInput } from '../src/invoice/data';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-tana', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
});
afterAll(() => env.cleanup());

const now = () => Timestamp.now();
const as = (uid: string) => env.authenticatedContext(uid, { phone_number: '+60123456789' }).firestore();
const photo = (id: string) => `teams/A/invoices/${id}/abc.jpg`;
const input = (over: Partial<InvoiceInput> = {}): InvoiceInput => ({
  kind: 'claim', amountSen: 1250, date: '2026-11-14', vendor: 'Kedai', category: 'Fuel', notes: '', relatedUids: [], uploaderName: 'Mem', ...over,
});
const seed = (over: object) => ({
  kind: 'claim', amountSen: 1250, date: '2026-11-14', vendor: 'Kedai', category: 'Fuel', notes: '', photoPath: photo('x'),
  uploadedBy: 'mem', uploaderName: 'Mem', relatedUids: [], status: 'pending', createdAt: now(), updatedAt: now(), ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'teams/A'), { name: 'Team A', createdBy: 'admin', categories: ['x'], createdAt: now() });
    for (const [uid, role] of [['admin', 'admin'], ['fin', 'finance'], ['mem', 'member'], ['mem2', 'member']]) {
      await setDoc(doc(db, `teams/A/members/${uid}`), { uid, name: uid, role, status: 'active', joinedAt: now() });
    }
    await setDoc(doc(db, 'teams/A/invoices/claim1'), seed({ photoPath: photo('claim1') }));
    await setDoc(doc(db, 'teams/A/invoices/rej1'), seed({ photoPath: photo('rej1'), status: 'rejected', rejectReason: 'blurry' }));
    const co: Record<string, unknown> = seed({ photoPath: photo('co1'), kind: 'company', uploadedBy: 'fin', uploaderName: 'Fin', relatedUids: ['mem'] });
    delete co.status;
    await setDoc(doc(db, 'teams/A/invoices/co1'), co);
  });
});

describe('invoice write payloads from the app', () => {
  it('claim create (member)', async () => {
    await assertSucceeds(setDoc(doc(as('mem'), 'teams/A/invoices/new1'), createFields('mem', input(), photo('new1'))));
  });
  it('claim create with a related event', async () => {
    await assertSucceeds(setDoc(doc(as('mem'), 'teams/A/invoices/new2'), createFields('mem', input({ eventId: 'e1' }), photo('new2'))));
  });
  it('company create (finance, with related people)', async () => {
    await assertSucceeds(setDoc(doc(as('fin'), 'teams/A/invoices/new3'), createFields('fin', input({ kind: 'company', relatedUids: ['mem'], uploaderName: 'Fin' }), photo('new3'))));
  });
  it('a member cannot create a company invoice', async () => {
    await assertFails(setDoc(doc(as('mem'), 'teams/A/invoices/new4'), createFields('mem', input({ kind: 'company' }), photo('new4'))));
  });
  it('owner edit of a pending claim, with and without a replaced photo', async () => {
    await assertSucceeds(updateDoc(doc(as('mem'), 'teams/A/invoices/claim1'), updateFields(input({ amountSen: 2000, eventId: 'e1' }))));
    await assertSucceeds(updateDoc(doc(as('mem'), 'teams/A/invoices/claim1'), updateFields(input(), photo('claim1').replace('abc', 'def'))));
  });
  it('owner edit of a rejected claim keeps it rejected', async () => {
    await assertSucceeds(updateDoc(doc(as('mem'), 'teams/A/invoices/rej1'), updateFields(input({ amountSen: 999 }))));
  });
  it('resubmit (rejected -> pending)', async () => {
    await assertSucceeds(updateDoc(doc(as('mem'), 'teams/A/invoices/rej1'), resubmitFields()));
  });
  it('reimburse, and reimburse of a previously rejected claim', async () => {
    await assertSucceeds(updateDoc(doc(as('fin'), 'teams/A/invoices/claim1'), reimburseFields('2026-11-15')));
    await assertSucceeds(updateDoc(doc(as('admin'), 'teams/A/invoices/rej1'), reimburseFields('2026-11-15')));
  });
  it('reject with a reason', async () => {
    await assertSucceeds(updateDoc(doc(as('fin'), 'teams/A/invoices/claim1'), rejectFields('Blurry photo')));
  });
  it('company edit by finance', async () => {
    await assertSucceeds(updateDoc(doc(as('fin'), 'teams/A/invoices/co1'), updateFields(input({ kind: 'company', relatedUids: ['mem', 'mem2'], amountSen: 5000 }))));
  });
  it('categories update by admin', async () => {
    await assertSucceeds(updateDoc(doc(as('admin'), 'teams/A'), { categories: ['Fuel', 'Seeds'] }));
  });

  it('denied: a member processing a claim (reimburse, reject, own claim too)', async () => {
    await assertFails(updateDoc(doc(as('mem2'), 'teams/A/invoices/claim1'), reimburseFields('2026-11-15')));
    await assertFails(updateDoc(doc(as('mem2'), 'teams/A/invoices/claim1'), rejectFields('no')));
    await assertFails(updateDoc(doc(as('mem'), 'teams/A/invoices/claim1'), reimburseFields('2026-11-15')));
    await assertFails(updateDoc(doc(as('mem'), 'teams/A/invoices/claim1'), rejectFields('self')));
  });
  it('denied: a member editing categories', async () => {
    await assertFails(updateDoc(doc(as('mem'), 'teams/A'), { categories: ['Hack'] }));
  });
});
