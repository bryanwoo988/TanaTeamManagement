import { describe, it, expect } from 'vitest';
import { newInviteCode, normalizeInviteCode } from './inviteCode';

describe('inviteCode', () => {
  it('newInviteCode', () => {
    expect(newInviteCode(() => 0)).toBe('TANA-2222');
    expect(newInviteCode(() => 0.999999)).toBe('TANA-ZZZZ');
    for (let i = 0; i < 50; i++) expect(newInviteCode()).toMatch(/^TANA-[2-9A-HJKMNP-Z]{4}$/);
  });
  it('normalizeInviteCode', () => {
    expect(normalizeInviteCode(' tana-7k3p ')).toBe('TANA-7K3P');
    expect(normalizeInviteCode('7k3p')).toBe('TANA-7K3P');
    expect(normalizeInviteCode('TANA-7K3O')).toBeNull();
    expect(normalizeInviteCode('TANA-7K3')).toBeNull();
    expect(normalizeInviteCode('')).toBeNull();
  });
});
