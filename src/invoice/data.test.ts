import { beforeEach, describe, expect, it, vi } from 'vitest';

const setDoc = vi.fn().mockResolvedValue(undefined);
const updateDoc = vi.fn().mockResolvedValue(undefined);
const deleteDoc = vi.fn().mockResolvedValue(undefined);
const getDocs = vi.fn();
const getDoc = vi.fn();
const onSnapshot = vi.fn();
const uploadBytesResumable = vi.fn();
const getDownloadURL = vi.fn().mockResolvedValue('https://img/x.jpg');
vi.mock('../firebase', () => ({ db: {}, storage: {}, auth: { currentUser: { uid: 'me' } } }));
vi.mock('firebase/firestore', () => ({
  collection: (_d: unknown, ...p: string[]) => ({ path: p.join('/') }),
  doc: (c: unknown, ...p: string[]) => (p.length ? { path: [(c as { path?: string }).path, ...p].filter(Boolean).join('/'), id: p[p.length - 1] } : { path: `${(c as { path: string }).path}/newid`, id: 'newid' }),
  where: (f: string, op: string, v: unknown) => ({ f, op, v }),
  query: (c: { path: string }, ...w: unknown[]) => ({ path: c.path, w }),
  onSnapshot: (...a: unknown[]) => onSnapshot(...a),
  getDocs: (...a: unknown[]) => getDocs(...a),
  getDoc: (...a: unknown[]) => getDoc(...a),
  setDoc: (...a: unknown[]) => setDoc(...a),
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  deleteDoc: (...a: unknown[]) => deleteDoc(...a),
  serverTimestamp: () => 'TS',
  deleteField: () => 'DEL',
}));
vi.mock('firebase/storage', () => ({
  ref: (_s: unknown, p: string) => ({ fullPath: p }),
  uploadBytesResumable: (...a: unknown[]) => uploadBytesResumable(...a),
  getDownloadURL: (...a: unknown[]) => getDownloadURL(...a),
}));

import { deleteInvoice, fetchInvoices, getLinkedEvent, listEventsAround, listInvoices, photoUrl, resubmitClaim, saveCategories, saveInvoice, setClaimStatus, type InvoiceInput } from './data';

const input: InvoiceInput = { kind: 'claim', amountSen: 1250, date: '2026-11-10', vendor: 'Ah Seng', category: 'Fuel', notes: '', relatedUids: [], uploaderName: 'Me' };
const photo = new Blob(['x'], { type: 'image/jpeg' });

/** A resumable upload that reports progress then succeeds. */
function okUpload(progress: [number, number][] = [[50, 100], [100, 100]]) {
  uploadBytesResumable.mockImplementation(() => {
    let next: ((s: { bytesTransferred: number; totalBytes: number }) => void) | undefined;
    const p = new Promise<void>((res) => setTimeout(() => { progress.forEach(([a, b]) => next?.({ bytesTransferred: a, totalBytes: b })); res(); }, 0));
    return Object.assign(p, { on: (_e: string, n: typeof next) => { next = n; } });
  });
}

beforeEach(() => { vi.clearAllMocks(); okUpload(); });

describe('saveInvoice', () => {
  it('create: uploads to teams/t/invoices/{newId}/{photoId}.jpg first, then writes the doc with that path', async () => {
    const order: string[] = [];
    uploadBytesResumable.mockImplementation(() => { order.push('upload'); return Object.assign(Promise.resolve(), { on: () => {} }); });
    setDoc.mockImplementation(async () => { order.push('doc'); });
    const prog = vi.fn();
    const id = await saveInvoice('t1', null, input, photo, prog);
    expect(order).toEqual(['upload', 'doc']);
    expect(id).toBe('newid');
    const [ref, blob, meta] = uploadBytesResumable.mock.calls[0];
    expect(ref.fullPath).toMatch(/^teams\/t1\/invoices\/newid\/[A-Za-z0-9_-]+\.jpg$/);
    expect(blob).toBe(photo);
    expect(meta).toEqual({ contentType: 'image/jpeg' });
    const [dref, data] = setDoc.mock.calls[0];
    expect(dref.path).toBe('teams/t1/invoices/newid');
    expect(data).toMatchObject({ kind: 'claim', amountSen: 1250, uploadedBy: 'me', uploaderName: 'Me', status: 'pending', relatedUids: [], photoPath: ref.fullPath, createdAt: 'TS', updatedAt: 'TS' });
    expect(data).not.toHaveProperty('eventId');
  });

  it('create without a photo is refused', async () => {
    await expect(saveInvoice('t1', null, input)).rejects.toThrow('photo.required');
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('reports upload progress as a fraction', async () => {
    const prog = vi.fn();
    await saveInvoice('t1', null, input, photo, prog);
    expect(prog.mock.calls.map((c) => c[0])).toEqual([0.5, 1]);
  });

  it('company invoice has no status and carries relatedUids and eventId', async () => {
    await saveInvoice('t1', null, { ...input, kind: 'company', relatedUids: ['bob'], eventId: 'e1' }, photo);
    const data = setDoc.mock.calls[0][1];
    expect(data).not.toHaveProperty('status');
    expect(data).toMatchObject({ kind: 'company', relatedUids: ['bob'], eventId: 'e1' });
  });

  it('an upload failure rejects and writes no document', async () => {
    uploadBytesResumable.mockImplementation(() => Object.assign(Promise.reject(new Error('net')), { on: () => {} }));
    await expect(saveInvoice('t1', null, input, photo)).rejects.toThrow('net');
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('update without a new photo keeps photoPath, never touches protected fields', async () => {
    await saveInvoice('t1', 'i1', { ...input, amountSen: 2000 });
    expect(uploadBytesResumable).not.toHaveBeenCalled();
    const [ref, data] = updateDoc.mock.calls[0];
    expect(ref.path).toBe('teams/t1/invoices/i1');
    expect(data).toMatchObject({ amountSen: 2000, updatedAt: 'TS', eventId: 'DEL' });
    for (const k of ['photoPath', 'kind', 'uploadedBy', 'uploaderName', 'createdAt', 'status', 'relatedUids']) expect(data).not.toHaveProperty(k);
  });

  it('replacing the photo uploads a NEW file in the same folder and updates photoPath', async () => {
    await saveInvoice('t1', 'i1', input, photo);
    const path = uploadBytesResumable.mock.calls[0][0].fullPath as string;
    expect(path).toMatch(/^teams\/t1\/invoices\/i1\/[A-Za-z0-9_-]+\.jpg$/);
    expect(updateDoc.mock.calls[0][1].photoPath).toBe(path);
  });

  it('company edit may change relatedUids', async () => {
    await saveInvoice('t1', 'i1', { ...input, kind: 'company', relatedUids: ['bob'] });
    expect(updateDoc.mock.calls[0][1].relatedUids).toEqual(['bob']);
  });

  it('two saves use two different photo files', async () => {
    await saveInvoice('t1', 'i1', input, photo);
    await saveInvoice('t1', 'i1', input, photo);
    expect(uploadBytesResumable.mock.calls[0][0].fullPath).not.toBe(uploadBytesResumable.mock.calls[1][0].fullPath);
  });
});

describe('retrying a failed create', () => {
  it('doc write fails once: the retry uploads no second file and reuses the invoice id and photoPath', async () => {
    const state = {};
    setDoc.mockRejectedValueOnce(new Error('denied'));
    await expect(saveInvoice('t1', null, input, photo, undefined, state)).rejects.toThrow('denied');
    await saveInvoice('t1', null, input, photo, undefined, state);
    expect(uploadBytesResumable).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(setDoc.mock.calls[1][0]).toEqual(setDoc.mock.calls[0][0]);
    expect(setDoc.mock.calls[1][1].photoPath).toBe(setDoc.mock.calls[0][1].photoPath);
  });

  it('upload fails then succeeds: still one invoice id; a different photo gets a new upload', async () => {
    const state = {};
    uploadBytesResumable.mockImplementationOnce(() => Object.assign(Promise.reject(new Error('net')), { on: () => {} }));
    await expect(saveInvoice('t1', null, input, photo, undefined, state)).rejects.toThrow('net');
    await saveInvoice('t1', null, input, photo, undefined, state);
    await saveInvoice('t1', null, input, new Blob(['y'], { type: 'image/jpeg' }), undefined, state);
    expect(uploadBytesResumable).toHaveBeenCalledTimes(3);
    expect(new Set(uploadBytesResumable.mock.calls.map((c) => (c[0].fullPath as string).split('/')[3])).size).toBe(1);
  });
});

describe('claim processing', () => {
  it('reimburse sets paidDate and clears any old rejectReason', async () => {
    await setClaimStatus('t1', 'i1', 'reimbursed', { paidDate: '2026-11-12' });
    expect(updateDoc.mock.calls[0][1]).toEqual({ status: 'reimbursed', paidDate: '2026-11-12', rejectReason: 'DEL', updatedAt: 'TS' });
  });

  it('reject needs a reason (trimmed, <= 300), and clears paidDate', async () => {
    await expect(setClaimStatus('t1', 'i1', 'rejected', { reason: '   ' })).rejects.toThrow('reason.required');
    await expect(setClaimStatus('t1', 'i1', 'rejected', { reason: 'x'.repeat(301) })).rejects.toThrow('reason.tooLong');
    expect(updateDoc).not.toHaveBeenCalled();
    await setClaimStatus('t1', 'i1', 'rejected', { reason: '  blurry  ' });
    expect(updateDoc.mock.calls[0][1]).toEqual({ status: 'rejected', rejectReason: 'blurry', paidDate: 'DEL', updatedAt: 'TS' });
  });

  it('resubmit moves rejected back to pending and clears the reason', async () => {
    await resubmitClaim('t1', 'i1');
    expect(updateDoc.mock.calls[0][1]).toEqual({ status: 'pending', rejectReason: 'DEL', updatedAt: 'TS' });
  });

  it('deleteInvoice and saveCategories', async () => {
    await deleteInvoice('t1', 'i1');
    expect(deleteDoc.mock.calls[0][0].path).toBe('teams/t1/invoices/i1');
    await saveCategories('t1', ['A', 'B']);
    expect(updateDoc.mock.calls[0][0].path).toBe('teams/t1');
    expect(updateDoc.mock.calls[0][1]).toEqual({ categories: ['A', 'B'] });
  });
});

describe('listInvoices', () => {
  const inv = (over: Record<string, unknown>) => ({ kind: 'claim', amountSen: 100, date: '2026-11-10', vendor: '', category: '', notes: '', photoPath: 'p', uploadedBy: 'me', uploaderName: 'Me', relatedUids: [], status: 'pending', ...over });
  const snap = (docs: Record<string, unknown>) => ({ docs: Object.entries(docs).map(([id, d]) => ({ id, data: () => d })) });

  it('finance/admin: one query on the whole collection', () => {
    onSnapshot.mockReturnValue(vi.fn());
    listInvoices('t1', {}, { uid: 'me', all: true }, () => {});
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot.mock.calls[0][0].path).toBe('teams/t1/invoices');
    expect(onSnapshot.mock.calls[0][0].w ?? []).toEqual([]);
  });

  it('member: two queries (uploadedBy, relatedUids array-contains), merged without duplicates, newest first', () => {
    const unsubs = [vi.fn(), vi.fn()];
    onSnapshot.mockReturnValueOnce(unsubs[0]).mockReturnValueOnce(unsubs[1]);
    const got: { id: string }[][] = [];
    const stop = listInvoices('t1', {}, { uid: 'me', all: false }, (l) => got.push(l));
    expect(onSnapshot.mock.calls.map((c) => c[0].w)).toEqual([[{ f: 'uploadedBy', op: '==', v: 'me' }], [{ f: 'relatedUids', op: 'array-contains', v: 'me' }]]);
    onSnapshot.mock.calls[0][1](snap({ a: inv({ date: '2026-11-01' }), b: inv({ date: '2026-11-05' }) }));
    onSnapshot.mock.calls[1][1](snap({ b: inv({ date: '2026-11-05' }), c: inv({ kind: 'company', date: '2026-11-09', uploadedBy: 'boss', relatedUids: ['me'] }) }));
    expect(got.at(-1)!.map((i) => i.id)).toEqual(['c', 'b', 'a']);
    stop();
    expect(unsubs[0]).toHaveBeenCalled();
    expect(unsubs[1]).toHaveBeenCalled();
  });

  it('filters by type, status and date range', () => {
    onSnapshot.mockReturnValue(vi.fn());
    const got: { id: string }[][] = [];
    const docs = snap({
      a: inv({ date: '2026-11-01' }), b: inv({ date: '2026-11-05', status: 'rejected' }),
      c: inv({ kind: 'company', date: '2026-11-09', status: undefined }), d: inv({ date: '2026-12-01', status: 'reimbursed' }),
    });
    const run = (f: object) => { onSnapshot.mockClear(); listInvoices('t1', f, { uid: 'me', all: true }, (l) => got.push(l)); onSnapshot.mock.calls[0][1](docs); return got.at(-1)!.map((i) => i.id); };
    expect(run({ kind: 'company' })).toEqual(['c']);
    expect(run({ status: 'rejected' })).toEqual(['b']);
    expect(run({ from: '2026-11-05', to: '2026-11-30' })).toEqual(['c', 'b']);
  });

  it('passes errors on', () => {
    onSnapshot.mockReturnValue(vi.fn());
    const onError = vi.fn();
    listInvoices('t1', {}, { uid: 'me', all: true }, () => {}, onError);
    onSnapshot.mock.calls[0][2](new Error('x'));
    expect(onError).toHaveBeenCalled();
  });
});

describe('related work and photo url', () => {
  it('listEventsAround queries this team events within +-30 days', async () => {
    getDocs.mockResolvedValue({ docs: [{ id: 'e1', data: () => ({ title: 'Spray', date: '2026-11-12' }) }] });
    const r = await listEventsAround('t1', '2026-11-15');
    const q = getDocs.mock.calls[0][0];
    expect(q.path).toBe('teams/t1/events');
    expect(q.w).toEqual([{ f: 'date', op: '>=', v: '2026-10-16' }, { f: 'date', op: '<=', v: '2026-12-15' }]);
    expect(r).toEqual([{ id: 'e1', title: 'Spray', date: '2026-11-12' }]);
  });

  it('getLinkedEvent reads the team event, null when gone or unreadable', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ title: 'Spray', date: '2026-11-12', assignees: [] }) });
    expect(await getLinkedEvent('t1', 'e1')).toEqual({ title: 'Spray', date: '2026-11-12' });
    expect(getDoc.mock.calls[0][0].path).toBe('teams/t1/events/e1');
    getDoc.mockResolvedValueOnce({ exists: () => false });
    expect(await getLinkedEvent('t1', 'e2')).toBeNull();
    getDoc.mockRejectedValueOnce(new Error('permission-denied'));
    expect(await getLinkedEvent('t1', 'e3')).toBeNull();
  });

  it('photoUrl resolves the stored path', async () => {
    expect(await photoUrl('teams/t1/invoices/i1/p.jpg')).toBe('https://img/x.jpg');
    expect(getDownloadURL.mock.calls[0][0].fullPath).toBe('teams/t1/invoices/i1/p.jpg');
  });
});

describe('fetchInvoices (one-shot export read)', () => {
  const snap = (...rows: [string, object][]) => ({ docs: rows.map(([id, d]) => ({ id, data: () => d })) });
  it('members read only their own two queries, merged, de-duplicated, filtered and newest first', async () => {
    getDocs.mockResolvedValueOnce(snap(['a', { date: '2026-11-02', kind: 'claim' }], ['b', { date: '2026-11-09', kind: 'claim' }]))
      .mockResolvedValueOnce(snap(['b', { date: '2026-11-09', kind: 'claim' }], ['c', { date: '2026-11-05', kind: 'company' }]));
    const rows = await fetchInvoices('t1', { kind: 'claim' }, { uid: 'me', all: false });
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
    expect(getDocs.mock.calls.map((c) => (c[0] as { w: { f: string }[] }).w[0].f)).toEqual(['uploadedBy', 'relatedUids']);
  });
  it('finance reads the whole collection once', async () => {
    getDocs.mockResolvedValueOnce(snap(['a', { date: '2026-11-02', kind: 'claim' }]));
    await fetchInvoices('t1', {}, { uid: 'me', all: true });
    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(getDocs.mock.calls[0][0]).toEqual({ path: 'teams/t1/invoices' });
  });
});
