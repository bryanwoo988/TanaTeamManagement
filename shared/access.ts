import type { EventDoc, InvoiceDoc, MemberDoc } from './types';

type M = (Pick<MemberDoc, 'role' | 'status'> & Partial<Pick<MemberDoc, 'canUpload'>>) | undefined;

export function isActive(m: M): boolean {
  return !!m && m.status === 'active';
}

export function canEditEvent(m: M, e: Pick<EventDoc, 'assignees'>, uid: string): boolean {
  if (!isActive(m)) return false;
  return m!.role === 'admin' || e.assignees.includes(uid);
}

export function canSeeInvoice(m: M, inv: Pick<InvoiceDoc, 'uploadedBy' | 'relatedUids'>, uid: string): boolean {
  if (!isActive(m)) return false;
  if (m!.role === 'admin' || m!.role === 'finance') return true;
  return inv.uploadedBy === uid || inv.relatedUids.includes(uid);
}

export function canProcessClaims(m: M): boolean {
  return isActive(m) && (m!.role === 'admin' || m!.role === 'finance');
}

export function canExportInvoices(m: M): boolean {
  return canProcessClaims(m);
}

/** May create new expense claims: admin/finance always; a member unless an admin turned it off (absent = allowed). */
export function canUploadClaims(m: M): boolean {
  return isActive(m) && (m!.role === 'admin' || m!.role === 'finance' || m!.canUpload !== false);
}
