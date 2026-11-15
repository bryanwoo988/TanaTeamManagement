import { collection, deleteDoc, deleteField, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, type Unsubscribe } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { addDays } from '../../shared/dates';
import type { ClaimStatus, EventDoc, InvoiceDoc, InvoiceKind } from '../../shared/types';
import { toastError } from '../ui/toast';

export type InvoiceRow = InvoiceDoc & { id: string };
/** What the editor produces: the fields a person fills in (plus the name to stamp on a new upload). */
export interface InvoiceInput {
  kind: InvoiceKind; amountSen: number; date: string; vendor: string; category: string; notes: string;
  relatedUids: string[]; eventId?: string; uploaderName: string;
}
export interface InvoiceFilters { kind?: InvoiceKind; status?: ClaimStatus; from?: string; to?: string }
/** `all` = finance/admin (sees every invoice); otherwise only own claims and invoices naming the user. */
export interface Viewer { uid: string; all: boolean }

const ACK_MS = 4000;

function uidOf(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('not signed in');
  return uid;
}

/**
 * A write resolves only on server ack, which never comes offline. Wait briefly so validation/permission
 * errors reach the form, then let it finish in the background (a late failure becomes a toast).
 */
async function ack(p: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<'slow'>((res) => { timer = setTimeout(() => res('slow'), ACK_MS); });
  try {
    if ((await Promise.race([p.then(() => 'ok' as const), slow])) === 'slow') p.catch(() => toastError());
  } finally {
    clearTimeout(timer);
  }
}

function newId(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

const invoicesRef = (teamId: string) => collection(db, 'teams', teamId, 'invoices');

/** Live invoices the viewer may see, newest first; filters apply on the client (the sets are small). */
export function listInvoices(teamId: string, filters: InvoiceFilters, me: Viewer, onChange: (rows: InvoiceRow[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const parts: Map<string, InvoiceRow>[] = [];
  const emit = () => {
    const merged = new Map<string, InvoiceRow>();
    for (const m of parts) for (const [id, r] of m) merged.set(id, r);
    onChange([...merged.values()]
      .filter((r) => (!filters.kind || r.kind === filters.kind) && (!filters.status || r.status === filters.status)
        && (!filters.from || r.date >= filters.from) && (!filters.to || r.date <= filters.to))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)));
  };
  const queries = me.all
    ? [invoicesRef(teamId)]
    : [query(invoicesRef(teamId), where('uploadedBy', '==', me.uid)), query(invoicesRef(teamId), where('relatedUids', 'array-contains', me.uid))];
  const unsubs = queries.map((q, i) => {
    parts[i] = new Map();
    return onSnapshot(q, (snap) => {
      parts[i] = new Map(snap.docs.map((d) => [d.id, { ...(d.data() as InvoiceDoc), id: d.id }]));
      emit();
    }, (e) => onError?.(e));
  });
  return () => unsubs.forEach((u) => u());
}

/** Live single invoice; `null` when it does not exist or may not be read. */
export function watchInvoice(teamId: string, id: string, onChange: (r: InvoiceRow | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'teams', teamId, 'invoices', id),
    (s) => onChange(s.exists() ? { ...(s.data() as InvoiceDoc), id: s.id } : null),
    () => onChange(null));
}

/** Download URL for a stored photo. Only works once the invoice doc exists (storage rules read the doc). */
export async function photoUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

/**
 * Create (id null) or update an invoice. A new photo goes to a NEW file teams/{t}/invoices/{id}/{photoId}.jpg
 * first (storage never overwrites; the doc must not exist yet for the first file), then the doc is written.
 * Replacing a photo just points photoPath at the new file; the old one is deleted by a backend trigger.
 * Create requires a photo. Returns the invoice id. `onProgress` gets 0..1 while uploading.
 */
export async function saveInvoice(teamId: string, id: string | null, data: InvoiceInput, photo?: Blob, onProgress?: (fraction: number) => void): Promise<string> {
  const uid = uidOf();
  if (id === null && !photo) throw new Error('photo.required');
  const invoiceId = id ?? doc(invoicesRef(teamId)).id;
  let photoPath: string | undefined;
  if (photo) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
    photoPath = `teams/${teamId}/invoices/${invoiceId}/${newId()}.jpg`;
    const task = uploadBytesResumable(ref(storage, photoPath), photo, { contentType: 'image/jpeg' });
    task.on('state_changed', (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0));
    await task;
  }
  const common = { amountSen: data.amountSen, date: data.date, vendor: data.vendor, category: data.category, notes: data.notes };
  const target = doc(db, 'teams', teamId, 'invoices', invoiceId);
  if (id === null) {
    const claim = data.kind === 'claim';
    await ack(setDoc(target, {
      ...common, kind: data.kind, photoPath, uploadedBy: uid, uploaderName: data.uploaderName,
      relatedUids: claim ? [] : data.relatedUids, ...(data.eventId ? { eventId: data.eventId } : {}),
      ...(claim ? { status: 'pending' } : {}), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  } else {
    await ack(updateDoc(target, {
      ...common, eventId: data.eventId || deleteField(),
      ...(data.kind === 'company' ? { relatedUids: data.relatedUids } : {}),
      ...(photoPath ? { photoPath } : {}), updatedAt: serverTimestamp(),
    }));
  }
  return invoiceId;
}

/** Finance/admin decision on a claim. Reject needs a reason (trimmed, at most 300 characters). */
export async function setClaimStatus(teamId: string, id: string, status: Exclude<ClaimStatus, 'pending'>, extra: { paidDate?: string; reason?: string } = {}): Promise<void> {
  const target = doc(db, 'teams', teamId, 'invoices', id);
  if (status === 'reimbursed') {
    await ack(updateDoc(target, { status, paidDate: extra.paidDate || deleteField(), rejectReason: deleteField(), updatedAt: serverTimestamp() }));
    return;
  }
  const reason = (extra.reason ?? '').trim();
  if (!reason) throw new Error('reason.required');
  if (reason.length > 300) throw new Error('reason.tooLong');
  await ack(updateDoc(target, { status, rejectReason: reason, paidDate: deleteField(), updatedAt: serverTimestamp() }));
}

/** Owner puts a rejected claim back in the queue. */
export async function resubmitClaim(teamId: string, id: string): Promise<void> {
  await ack(updateDoc(doc(db, 'teams', teamId, 'invoices', id), { status: 'pending', rejectReason: deleteField(), updatedAt: serverTimestamp() }));
}

export async function deleteInvoice(teamId: string, id: string): Promise<void> {
  await ack(deleteDoc(doc(db, 'teams', teamId, 'invoices', id)));
}

export async function saveCategories(teamId: string, categories: string[]): Promise<void> {
  await ack(updateDoc(doc(db, 'teams', teamId), { categories }));
}

/** This team's events within 30 days either side of `date`, for the optional "related work" picker. */
export async function listEventsAround(teamId: string, date: string): Promise<(EventDoc & { id: string })[]> {
  const q = query(collection(db, 'teams', teamId, 'events'), where('date', '>=', addDays(date, -30)), where('date', '<=', addDays(date, 30)));
  return (await getDocs(q)).docs.map((d) => ({ ...(d.data() as EventDoc), id: d.id }));
}
