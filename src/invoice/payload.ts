import { deleteField, serverTimestamp } from 'firebase/firestore';
import type { InvoiceInput } from './data';

// The exact field maps written to Firestore, kept apart from the SDK calls so the rules tests replay them verbatim.

const common = (d: InvoiceInput) => ({ amountSen: d.amountSen, date: d.date, vendor: d.vendor, category: d.category, notes: d.notes });

export function createFields(uid: string, d: InvoiceInput, photoPath: string) {
  const claim = d.kind === 'claim';
  return {
    ...common(d), kind: d.kind, photoPath, uploadedBy: uid, uploaderName: d.uploaderName,
    relatedUids: claim ? [] : d.relatedUids, ...(d.eventId ? { eventId: d.eventId } : {}),
    ...(claim ? { status: 'pending' } : {}), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
}

export function updateFields(d: InvoiceInput, photoPath?: string) {
  return {
    ...common(d), eventId: d.eventId || deleteField(),
    ...(d.kind === 'company' ? { relatedUids: d.relatedUids } : {}),
    ...(photoPath ? { photoPath } : {}), updatedAt: serverTimestamp(),
  };
}

export const reimburseFields = (paidDate?: string) =>
  ({ status: 'reimbursed', paidDate: paidDate || deleteField(), rejectReason: deleteField(), updatedAt: serverTimestamp() });
export const rejectFields = (reason: string) =>
  ({ status: 'rejected', rejectReason: reason, paidDate: deleteField(), updatedAt: serverTimestamp() });
export const resubmitFields = () => ({ status: 'pending', rejectReason: deleteField(), updatedAt: serverTimestamp() });
