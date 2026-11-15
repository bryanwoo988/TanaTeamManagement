import { describe, it, expect } from 'vitest';
import { parseRM, formatRM } from './money';

describe('money', () => {
  it('parseRM', () => {
    expect(parseRM('1,250.5')).toBe(125050);
    expect(parseRM('RM 12')).toBe(1200);
    expect(parseRM('0.05')).toBe(5);
    expect(parseRM('abc')).toBeNull();
    expect(parseRM('0')).toBeNull();
    expect(parseRM('')).toBeNull();
    expect(parseRM('-5')).toBeNull();
    expect(parseRM('1.234')).toBeNull();
  });
  it('formatRM', () => {
    expect(formatRM(125050)).toBe('RM 1,250.50');
    expect(formatRM(5)).toBe('RM 0.05');
    expect(formatRM(100000000)).toBe('RM 1,000,000.00');
  });
});
