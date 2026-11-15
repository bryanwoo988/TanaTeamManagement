import { beforeEach, describe, expect, it } from 'vitest';
import { THEMES, contrast } from './themes';
import { getAppearance } from './appearance';

describe('themes', () => {
  it('every theme meets contrast and has 6 distinct visible team colours', () => {
    for (const [id, th] of Object.entries(THEMES)) {
      const m = (a: string, b: string) => `${id} ${a} on ${b}`;
      expect(contrast(th.fg, th.bg), m('fg', 'bg')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(th.fg, th.card), m('fg', 'card')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(th.muted, th.card), m('muted', 'card')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(th.accentFg, th.accent), m('accentFg', 'accent')).toBeGreaterThanOrEqual(4.5);
      for (const k of ['ok', 'warn', 'err'] as const) {
        expect(contrast(th.fg, th[`${k}Soft`]), m('fg', `${k}Soft`)).toBeGreaterThanOrEqual(4.5);
      }
      expect(new Set(th.team).size).toBe(6);
      for (const c of th.team) expect(contrast(c, th.card), m(c, 'card')).toBeGreaterThanOrEqual(3);
    }
  });
  it('lists light and dark themes in order', () => {
    expect(Object.values(THEMES).filter((t) => t.kind === 'light').map((t) => t.label)).toEqual(['Classic', 'Paper', 'Mint', 'Lavender']);
    expect(Object.values(THEMES).filter((t) => t.kind === 'dark').map((t) => t.label)).toEqual(['Midnight', 'OLED Black', 'Slate', 'Grape']);
    expect(THEMES.oled.bg).toBe('#000000');
  });
  beforeEach(() => localStorage.clear());
  it('defaults', () => {
    expect(getAppearance()).toEqual({ mode: 'system', light: 'paper', dark: 'midnight' });
  });
});
