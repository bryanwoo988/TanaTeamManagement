import { describe, it, expect } from 'vitest';
import { isDue, digestBody, digestDay } from './digest';

describe('isDue', () => {
  it('is true for the 15 minutes ending now', () => {
    expect(isDue('20:00', 20 * 60)).toBe(true);
    expect(isDue('20:00', 20 * 60 + 14)).toBe(true);
    expect(isDue('20:00', 20 * 60 + 15)).toBe(false);
    expect(isDue('20:00', 20 * 60 - 1)).toBe(false);
  });
  it('wraps midnight', () => {
    // Brief listed isDue('23:50', 0*60+5) === true, but 23:50 -> 00:05 is exactly 15 minutes, the same
    // gap as the brief's own isDue('20:00', 20*60+15) === false. Window (now-15, now] wins; see report.
    expect(isDue('23:55', 0 * 60 + 5)).toBe(true);
    expect(isDue('23:50', 0 * 60 + 5)).toBe(false);
    expect(isDue('00:00', 0)).toBe(true);
    expect(isDue('23:45', 0)).toBe(false);
    expect(isDue('23:46', 0)).toBe(true);
  });
});

describe('digestDay', () => {
  it('is the day after the KL day the digest time fell on', () => {
    expect(digestDay('20:00', '2026-11-15', 20 * 60)).toBe('2026-11-16');
    // 23:50 seen at 00:05: the digest belonged to yesterday, so "tomorrow" is today.
    expect(digestDay('23:50', '2026-11-16', 5)).toBe('2026-11-16');
    expect(digestDay('00:00', '2026-11-16', 0)).toBe('2026-11-17');
  });
});

describe('digestBody', () => {
  const e = (title: string, allDay: boolean, start?: string, place = '') => ({ title, allDay, start, place });
  it('lists all-day first, then by start, with place', () => {
    expect(digestBody([e('B', false, '09:00'), e('A', false, '07:30', 'Lot 5'), e('C', true)], 'en'))
      .toBe('All day · C\n07:30 · A @ Lot 5\n09:00 · B');
    expect(digestBody([e('C', true)], 'zh')).toBe('全天 · C');
    expect(digestBody([e('C', true)], 'ms')).toBe('Sepanjang hari · C');
  });
  it('shows at most 5 lines then +N', () => {
    const many = Array.from({ length: 7 }, (_, i) => e(`T${i}`, false, `0${i}:00`));
    const lines = digestBody(many, 'en').split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[4]).toBe('04:00 · T4');
    expect(lines[5]).toBe('+2');
    expect(digestBody(many.slice(0, 5), 'en').split('\n')).toHaveLength(5);
  });
});
