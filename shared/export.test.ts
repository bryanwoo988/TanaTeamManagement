import { describe, expect, it } from 'vitest';
import { calendarRows, exportFilename, invoiceRows, needsCanvas, exportLabels } from './export';
import type { EventDoc, InvoiceDoc } from './types';

const ev = (id: string, o: Partial<EventDoc>) => ({ id, title: id, date: '2026-11-10', allDay: true, assignees: [], place: '', notes: '', createdBy: 'a', ...o }) as unknown as EventDoc & { id: string };
const inv = (id: string, o: Partial<InvoiceDoc>) => ({ id, kind: 'claim', amountSen: 1250, date: '2026-11-10', vendor: 'V', category: 'Fuel', notes: '', photoPath: 'p', uploadedBy: 'u', uploaderName: 'Ann', relatedUids: [], status: 'pending', ...o }) as unknown as InvoiceDoc & { id: string };

describe('calendarRows', () => {
  it('sorts by date then start time (all-day first) and resolves assignee names', () => {
    const rows = calendarRows([
      ev('late', { date: '2026-11-11' }),
      ev('b', { allDay: false, start: '14:00', end: '15:30', assignees: ['u1', 'u2', 'gone'] }),
      ev('a', { allDay: false, start: '08:00' }),
      ev('allday', {}),
    ], [{ uid: 'u1', name: 'Ann' }, { uid: 'u2', name: 'Bob' }], 'en');
    expect(rows.map((r) => r.title)).toEqual(['allday', 'a', 'b', 'late']);
    expect(rows[2].assignees).toBe('Ann, Bob');
    expect(rows[2].time).toBe('14:00-15:30');
    expect(rows[1].time).toBe('08:00');
    expect(rows[0].time).toBe('All day');
  });
  it('labels all-day per language', () => {
    expect(calendarRows([ev('x', {})], [], 'zh')[0].time).toBe('全天');
  });
});

describe('invoiceRows', () => {
  it('totals sen exactly and labels kind/status per language', () => {
    const { rows, totalSen } = invoiceRows([inv('1', { amountSen: 1010 }), inv('2', { amountSen: 20, kind: 'company', status: undefined }), inv('3', { status: 'reimbursed', amountSen: 5, paidDate: '2026-11-12' })], 'en');
    expect(totalSen).toBe(1035);
    expect(rows.map((r) => r.status)).toEqual(['Pending', '', 'Reimbursed']);
    expect(rows[1].kind).toBe('Company invoice');
    expect(rows[0].amountText).toBe('RM 10.10');
    expect(invoiceRows([inv('1', {})], 'zh').rows[0].status).toBe('待处理');
    expect(invoiceRows([inv('1', { status: 'rejected' })], 'ms').rows[0].status).toBe(exportLabels('ms').status.rejected);
  });
  it('sorts by date ascending', () => {
    expect(invoiceRows([inv('b', { date: '2026-11-12' }), inv('a', { date: '2026-11-01' })], 'en').rows.map((r) => r.date)).toEqual(['2026-11-01', '2026-11-12']);
  });
});

describe('exportFilename / needsCanvas', () => {
  it('follows tana-<team>-<from>_<to>.<ext>', () => {
    expect(exportFilename('Ladang Tana', '2026-11-01', '2026-11-30', 'xlsx')).toBe('tana-Ladang-Tana-2026-11-01_2026-11-30.xlsx');
    expect(exportFilename('a/b:c', '2026-11-01', '2026-11-30', 'pdf')).toBe('tana-a-b-c-2026-11-01_2026-11-30.pdf');
  });
  it('needs canvas for CJK or any non-Latin-1 text only', () => {
    expect(needsCanvas(['Ladang', 'Fuel'])).toBe(false);
    expect(needsCanvas(['Café Ñ'])).toBe(false);
    expect(needsCanvas(['农药 Pesticide'])).toBe(true);
  });
});
