import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuth } from './helpers';
import { sendCode } from '../src/lib/otp';
import { accountForPhone } from '../src/login';
import { secureRandom } from '../src/lib/random';
import { newInviteCode } from '../../shared/inviteCode';

describe('Twilio calls', () => {
  beforeEach(() => {
    process.env.TWILIO_API_KEY_SID = 'SK_test';
    process.env.TWILIO_API_KEY_SECRET = 'secret';
    process.env.TWILIO_VERIFY_SERVICE_SID = 'VA_test';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('give up after a timeout and report login.sendFailed', async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
    vi.stubGlobal('fetch', fetch);
    await expect(sendCode('+60123456789')).rejects.toMatchObject({ message: 'login.sendFailed' });
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('accountForPhone', () => {
  beforeEach(() => clearAuth());

  it('concurrent first logins for one number end up on one account', async () => {
    const uids = await Promise.all(Array.from({ length: 6 }, () => accountForPhone('+60128880000')));
    expect(new Set(uids).size).toBe(1);
  });
});

describe('secureRandom', () => {
  it('is a crypto-backed number in [0, 1) usable for invite codes', () => {
    const xs = Array.from({ length: 2000 }, () => secureRandom());
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Set(xs).size).toBeGreaterThan(1990);
    expect(newInviteCode(secureRandom)).toMatch(/^TANA-[2-9A-HJKMNP-Z]{4}$/);
  });
});
