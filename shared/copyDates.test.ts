import { describe, it, expect } from 'vitest';
import { copyEventToDates } from './copyDates';
import type { EventDoc } from './types';

const ev = { title: 'Spray', date: '2026-11-15', allDay: false, start: '08:00', end: '10:00',
  assignees: ['u1', 'u2'], place: 'Plot A', notes: '', createdBy: 'u1', updatedAt: {} as never } as EventDoc;

describe('copyEventToDates', () => {
  it('skips source date, dedupes, sorts', () => {
    const copies = copyEventToDates(ev, ['2026-11-20', '2026-11-18', '2026-11-15', '2026-11-20']);
    expect(copies.map((c) => c.date)).toEqual(['2026-11-18', '2026-11-20']);
    expect(copies[0]).toMatchObject({ title: ev.title, start: ev.start, assignees: ev.assignees });
  });
  it('does not share the assignees array', () => {
    const [c] = copyEventToDates(ev, ['2026-11-18']);
    c.assignees.push('x');
    expect(ev.assignees).toEqual(['u1', 'u2']);
  });
  it('allows exactly 60, throws beyond', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10));
    expect(copyEventToDates(ev, mk(60))).toHaveLength(60);
    expect(() => copyEventToDates(ev, mk(61))).toThrow('tooManyDates');
  });
});
