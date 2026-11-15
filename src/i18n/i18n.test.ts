import { describe, it, expect } from 'vitest';
import { zh } from './zh';
import { en } from './en';
import { ms } from './ms';
import { t, setLang, getLang, detectLang } from './index';

describe('i18n', () => {
  it('has key parity across languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    expect(Object.keys(ms).sort()).toEqual(Object.keys(zh).sort());
  });
  it('has no empty strings', () => {
    for (const d of [zh, en, ms]) for (const v of Object.values(d)) expect(v.trim()).not.toBe('');
  });
  it('detects language', () => {
    expect(detectLang('zh-CN')).toBe('zh');
    expect(detectLang('ms-MY')).toBe('ms');
    expect(detectLang('id')).toBe('ms');
    expect(detectLang('fr')).toBe('en');
  });
  it('sets html lang and interpolates', () => {
    setLang('ms');
    expect(getLang()).toBe('ms');
    expect(document.documentElement.lang).toBe('ms');
    setLang('zh');
    expect(document.documentElement.lang).toBe('zh-Hans');
    expect(t('greet', { name: 'Ali' })).toContain('Ali');
  });
});
