import { describe, it, expect } from 'vitest';
import { notifyText, testPushText } from './notifyText';
import type { NotifyKind } from './types';

const KINDS: NotifyKind[] = ['digest', 'assigned', 'changed', 'companyInvoice', 'claimSubmitted', 'claimDone', 'joinRequest', 'joined'];
const sampleVars = { title: 'Spray', team: 'East Farm', when: '2026-11-16 08:00', count: 1, name: 'Alice', amount: 'RM 12.50', vendor: 'Kedai', status: 'reimbursed', list: '08:00 Spray' };

describe('notifyText', () => {
  it('has a non-empty title and body for every kind in every language', () => {
    for (const l of ['zh', 'en', 'ms'] as const) for (const k of KINDS) {
      const t = notifyText(k, l, sampleVars);
      expect(t.title).not.toBe('');
      expect(t.body).not.toBe('');
      expect(t.title + t.body).not.toMatch(/[{}]/);
    }
  });
  it('fills variables', () => {
    expect(notifyText('assigned', 'en', sampleVars)).toEqual({ title: 'New work: Spray', body: 'East Farm · 2026-11-16 08:00' });
    expect(notifyText('joinRequest', 'zh', { name: 'Bob', team: 'East Farm' }).body).toContain('Bob');
  });
  it('uses the multi-date variant when count > 1', () => {
    expect(notifyText('assigned', 'en', { ...sampleVars, count: 4 }).body).toContain('4');
    expect(notifyText('assigned', 'ms', { ...sampleVars, count: 4 }).body).toContain('4');
  });
  it('uses the cancelled variant for changed', () => {
    const changed = notifyText('changed', 'en', sampleVars);
    const cancelled = notifyText('changed', 'en', { ...sampleVars, cancelled: 1 });
    expect(cancelled.title).not.toBe(changed.title);
    expect(cancelled.title).toContain('Spray');
  });
  it('uses the rejected variant for claimDone', () => {
    const ok = notifyText('claimDone', 'en', sampleVars);
    const no = notifyText('claimDone', 'en', { ...sampleVars, status: 'rejected', reason: 'Blurry' });
    expect(no.title).not.toBe(ok.title);
    expect(no.body).toContain('Blurry');
  });
  it('digest body is the list', () => {
    expect(notifyText('digest', 'en', { count: 2, list: 'a\nb' })).toEqual({ title: 'Tomorrow: 2 jobs', body: 'a\nb' });
  });
});

describe('testPushText', () => {
  it('has a title and body in every language, falling back to English', () => {
    for (const l of ['zh', 'en', 'ms'] as const) {
      const t = testPushText(l);
      expect(t.title).toBeTruthy();
      expect(t.body).toBeTruthy();
    }
    expect(testPushText('ms').title).toBe('Notifikasi ujian');
    expect(testPushText('xx' as never)).toEqual(testPushText('en'));
  });
});
