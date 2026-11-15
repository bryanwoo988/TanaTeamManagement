import { describe, it, expect } from 'vitest';
import { klDate, klTime, addDays, minutesOf } from './dates';

describe('dates', () => {
  it('klDate uses UTC+8', () => {
    expect(klDate(new Date('2026-11-15T16:30:00Z'))).toBe('2026-11-16');
    expect(klDate(new Date('2026-11-15T15:59:00Z'))).toBe('2026-11-15');
  });
  it('klTime uses UTC+8, 24h', () => {
    expect(klTime(new Date('2026-11-15T16:30:00Z'))).toBe('00:30');
    expect(klTime(new Date('2026-11-15T01:05:00Z'))).toBe('09:05');
  });
  it('addDays crosses month/year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-11-15', 0)).toBe('2026-11-15');
  });
  it('minutesOf', () => {
    expect(minutesOf('00:00')).toBe(0);
    expect(minutesOf('08:30')).toBe(510);
  });
});
