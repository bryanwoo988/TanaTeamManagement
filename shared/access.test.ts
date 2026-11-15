import { describe, it, expect } from 'vitest';
import { canEditEvent, canSeeInvoice, canProcessClaims, canExportInvoices, canUploadClaims, isActive } from './access';

const admin = { role: 'admin', status: 'active' } as const;
const fin = { role: 'finance', status: 'active' } as const;
const mem = { role: 'member', status: 'active' } as const;
const pend = { role: 'admin', status: 'pending' } as const;

describe('access', () => {
  it('canUploadClaims: active members unless turned off; admin/finance always', () => {
    expect(canUploadClaims(mem)).toBe(true);
    expect(canUploadClaims({ ...mem, canUpload: true })).toBe(true);
    expect(canUploadClaims({ ...mem, canUpload: false })).toBe(false);
    expect(canUploadClaims({ ...admin, canUpload: false })).toBe(true);
    expect(canUploadClaims({ ...fin, canUpload: false })).toBe(true);
    expect(canUploadClaims(pend)).toBe(false);
    expect(canUploadClaims({ role: 'member', status: 'pending' })).toBe(false);
    expect(canUploadClaims(undefined)).toBe(false);
  });
  it('canEditEvent', () => {
    expect(canEditEvent(mem, { assignees: ['u1'] }, 'u1')).toBe(true);
    expect(canEditEvent(mem, { assignees: ['u2'] }, 'u1')).toBe(false);
    expect(canEditEvent(admin, { assignees: ['u2'] }, 'u1')).toBe(true);
    expect(canEditEvent(pend, { assignees: ['u1'] }, 'u1')).toBe(false);
    expect(canEditEvent(undefined, { assignees: ['u1'] }, 'u1')).toBe(false);
  });
  it('canSeeInvoice', () => {
    expect(canSeeInvoice(mem, { uploadedBy: 'u1', relatedUids: [] }, 'u1')).toBe(true);
    expect(canSeeInvoice(mem, { uploadedBy: 'u2', relatedUids: ['u1'] }, 'u1')).toBe(true);
    expect(canSeeInvoice(mem, { uploadedBy: 'u2', relatedUids: [] }, 'u1')).toBe(false);
    expect(canSeeInvoice(fin, { uploadedBy: 'u2', relatedUids: [] }, 'u1')).toBe(true);
    expect(canSeeInvoice(admin, { uploadedBy: 'u2', relatedUids: [] }, 'u1')).toBe(true);
    expect(canSeeInvoice(pend, { uploadedBy: 'u1', relatedUids: [] }, 'u1')).toBe(false);
  });
  it('canProcessClaims / canExportInvoices / isActive', () => {
    for (const fn of [canProcessClaims, canExportInvoices]) {
      expect(fn(admin)).toBe(true);
      expect(fn(fin)).toBe(true);
      expect(fn(mem)).toBe(false);
      expect(fn(pend)).toBe(false);
      expect(fn(undefined)).toBe(false);
    }
    expect(isActive(mem)).toBe(true);
    expect(isActive(pend)).toBe(false);
    expect(isActive(undefined)).toBe(false);
  });
});
