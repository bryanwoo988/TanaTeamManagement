import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getMetadata, ref, uploadBytes } from 'firebase/storage';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-tana',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
afterAll(() => env.cleanup());

const now = () => Timestamp.now();
const JPEG = { contentType: 'image/jpeg' };
const small = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const path = (t: string, inv: string, file = 'p1.jpg') => `teams/${t}/invoices/${inv}/${file}`;

const MEMBERS: Record<string, [string, string, string]> = {
  admin: ['A', 'admin', 'active'], fin: ['A', 'finance', 'active'], mem: ['A', 'member', 'active'],
  mem2: ['A', 'member', 'active'], pend: ['A', 'member', 'pending'], bMem: ['B', 'member', 'active'],
};
const INVOICES: Record<string, object> = {
  claimMem: { kind: 'claim', uploadedBy: 'mem', relatedUids: [], status: 'pending' },
  claimMem2: { kind: 'claim', uploadedBy: 'mem2', relatedUids: [], status: 'pending' },
  company1: { kind: 'company', uploadedBy: 'fin', relatedUids: ['mem'] },
  company2: { kind: 'company', uploadedBy: 'fin', relatedUids: [] },
  claimGone: { kind: 'claim', uploadedBy: 'gone', relatedUids: [], status: 'pending' },
};

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, [t, role, status]] of Object.entries(MEMBERS)) {
      await setDoc(doc(db, `teams/${t}/members/${uid}`), { uid, name: uid, role, status, joinedAt: now() });
    }
    for (const [id, over] of Object.entries(INVOICES)) {
      await setDoc(doc(db, `teams/A/invoices/${id}`), {
        amountSen: 1000, date: '2026-11-15', vendor: 'v', category: 'c', notes: '', photoPath: path('A', id),
        uploaderName: 'x', createdAt: now(), updatedAt: now(), ...over,
      });
      await uploadBytes(ref(ctx.storage(), path('A', id)), small(), JPEG);
    }
    await uploadBytes(ref(ctx.storage(), path('A', 'orphan')), small(), JPEG);
  });
});

const st = (uid: string) => env.authenticatedContext(uid).storage();
const anon = () => env.unauthenticatedContext().storage();

describe('read invoice photos', () => {
  it('finance and admin read every photo', async () => {
    for (const id of Object.keys(INVOICES)) {
      await assertSucceeds(getMetadata(ref(st('fin'), path('A', id))));
      await assertSucceeds(getMetadata(ref(st('admin'), path('A', id))));
    }
  });
  it('member reads own claim photo and photos of company invoices they are ticked on', async () => {
    await assertSucceeds(getMetadata(ref(st('mem'), path('A', 'claimMem'))));
    await assertSucceeds(getMetadata(ref(st('mem'), path('A', 'company1'))));
  });
  it('member cannot read others claim photos or unticked company photos', async () => {
    await assertFails(getMetadata(ref(st('mem'), path('A', 'claimMem2'))));
    await assertFails(getMetadata(ref(st('mem'), path('A', 'company2'))));
  });
  it('photo with no invoice doc is not readable by members', async () => {
    await assertFails(getMetadata(ref(st('mem'), path('A', 'orphan'))));
  });
  it('pending, removed, outsider and anonymous cannot read', async () => {
    await assertFails(getMetadata(ref(st('pend'), path('A', 'claimMem'))));
    await assertFails(getMetadata(ref(st('gone'), path('A', 'claimGone'))));
    await assertFails(getMetadata(ref(st('bMem'), path('A', 'claimMem'))));
    await assertFails(getMetadata(ref(anon(), path('A', 'claimMem'))));
  });
});

describe('upload invoice photos', () => {
  it('active member uploads a JPEG for a new invoice', async () => {
    await assertSucceeds(uploadBytes(ref(st('mem'), path('A', 'newInv', 'a.jpg')), small(), JPEG));
  });
  it('owner uploads a replacement photo to own claim; finance to a company invoice', async () => {
    await assertSucceeds(uploadBytes(ref(st('mem'), path('A', 'claimMem', 'p2.jpg')), small(), JPEG));
    await assertSucceeds(uploadBytes(ref(st('fin'), path('A', 'company2', 'p2.jpg')), small(), JPEG));
    await assertSucceeds(uploadBytes(ref(st('admin'), path('A', 'claimMem', 'p3.jpg')), small(), JPEG));
  });
  it('a member whose receipt uploads are off cannot start a new invoice folder; true or absent may', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'teams/A/members/mem'), { canUpload: false });
      await updateDoc(doc(ctx.firestore(), 'teams/A/members/mem2'), { canUpload: true });
    });
    // Folder/file names no other test uses, so a denial can only come from the permission.
    await assertFails(uploadBytes(ref(st('mem'), path('A', 'offInv', 'off.jpg')), small(), JPEG));
    await assertSucceeds(uploadBytes(ref(st('mem2'), path('A', 'onInv', 'on.jpg')), small(), JPEG));
    await assertSucceeds(uploadBytes(ref(st('bMem'), path('B', 'absentInv', 'absent.jpg')), small(), JPEG));
  });
  it('with uploads off, the owner may still add a photo to their own existing claim', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'teams/A/members/mem'), { canUpload: false }));
    // A file name no other test uses: photos are never overwritten.
    await assertSucceeds(uploadBytes(ref(st('mem'), path('A', 'claimMem', 'fix-off.jpg')), small(), JPEG));
  });
  it('finance and admin upload new invoices regardless of canUpload', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'teams/A/members/fin'), { canUpload: false });
      await updateDoc(doc(ctx.firestore(), 'teams/A/members/admin'), { canUpload: false });
    });
    await assertSucceeds(uploadBytes(ref(st('fin'), path('A', 'finOffInv', 'f.jpg')), small(), JPEG));
    await assertSucceeds(uploadBytes(ref(st('admin'), path('A', 'adminOffInv', 'a.jpg')), small(), JPEG));
  });
  it('rejects wrong content type', async () => {
    await assertFails(uploadBytes(ref(st('mem'), path('A', 'newInv', 'a.png')), small(), { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(st('mem'), path('A', 'newInv', 'a.html')), small(), { contentType: 'text/html' }));
  });
  it('rejects files of 2 MB or more', async () => {
    await assertFails(uploadBytes(ref(st('mem'), path('A', 'newInv', 'big.jpg')), new Uint8Array(2 * 1024 * 1024), JPEG));
    await assertSucceeds(uploadBytes(ref(st('mem'), path('A', 'newInv', 'ok.jpg')), new Uint8Array(2 * 1024 * 1024 - 1), JPEG));
  });
  it('pending, removed, outsider and anonymous cannot upload', async () => {
    await assertFails(uploadBytes(ref(st('pend'), path('A', 'newInv', 'a.jpg')), small(), JPEG));
    await assertFails(uploadBytes(ref(st('gone'), path('A', 'newInv', 'a.jpg')), small(), JPEG));
    await assertFails(uploadBytes(ref(st('bMem'), path('A', 'newInv', 'a.jpg')), small(), JPEG));
    await assertFails(uploadBytes(ref(anon(), path('A', 'newInv', 'a.jpg')), small(), JPEG));
  });
  it('cannot overwrite an existing photo (financial record tampering)', async () => {
    await assertFails(uploadBytes(ref(st('mem'), path('A', 'company1')), small(), JPEG));
    await assertFails(uploadBytes(ref(st('mem'), path('A', 'claimMem')), small(), JPEG));
  });
  it('cannot add photos into an existing invoice the caller may not edit', async () => {
    await assertFails(uploadBytes(ref(st('mem2'), path('A', 'claimMem', 'x.jpg')), small(), JPEG));
    await assertFails(uploadBytes(ref(st('mem'), path('A', 'company1', 'x.jpg')), small(), JPEG));
  });
  it('cannot upload outside the invoice folder layout', async () => {
    await assertFails(uploadBytes(ref(st('mem'), 'teams/A/other/x.jpg'), small(), JPEG));
    await assertFails(uploadBytes(ref(st('mem'), 'teams/A/invoices/x.jpg'), small(), JPEG));
    await assertFails(uploadBytes(ref(st('mem'), 'users/mem/x.jpg'), small(), JPEG));
  });
});

describe('delete invoice photos', () => {
  it('nobody deletes from the client', async () => {
    await assertFails(deleteObject(ref(st('mem'), path('A', 'claimMem'))));
    await assertFails(deleteObject(ref(st('fin'), path('A', 'company1'))));
    await assertFails(deleteObject(ref(st('admin'), path('A', 'claimMem2'))));
  });
});
