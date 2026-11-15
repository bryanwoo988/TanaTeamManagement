import { describe, expect, it } from 'vitest';
import { CHANGELOG, formatKL } from './changelog';

describe('changelog', () => {
  it('has parallel, non-empty zh/en/ms lists per entry, newest first', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    for (const c of CHANGELOG) {
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      expect(c.items.zh.length).toBeGreaterThan(0);
      expect(c.items.en).toHaveLength(c.items.zh.length);
      expect(c.items.ms).toHaveLength(c.items.zh.length);
      for (const l of ['zh', 'en', 'ms'] as const) for (const i of c.items[l]) expect(i.trim()).not.toBe('');
    }
    const dates = CHANGELOG.map((c) => c.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
  it('formats instants in Kuala Lumpur time', () => {
    expect(formatKL('2026-11-15T16:30:00Z')).toBe('2026-11-16 00:30');
  });
});
