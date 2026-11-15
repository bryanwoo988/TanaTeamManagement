import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setDoc = vi.fn().mockResolvedValue(undefined);
const deleteDoc = vi.fn().mockResolvedValue(undefined);
const getDoc = vi.fn();
const getPushConfig = vi.fn();
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../api', () => ({ getPushConfig: () => getPushConfig() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
  setDoc: (...a: unknown[]) => setDoc(...a),
  deleteDoc: (...a: unknown[]) => deleteDoc(...a),
  getDoc: (...a: unknown[]) => getDoc(...a),
  serverTimestamp: () => 'TS',
}));

import { _resetPushKey, disablePush, enablePush, isLocalPath, pushActive, pushState, repairPush, resolvePushState } from './push';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36';

function env(ua: string, o: { standalone?: boolean; permission?: string; push?: boolean } = {}) {
  vi.stubGlobal('navigator', { userAgent: ua, standalone: o.standalone, serviceWorker: {} });
  vi.stubGlobal('matchMedia', undefined);
  if (o.push !== false) vi.stubGlobal('PushManager', class {});
  else vi.stubGlobal('PushManager', undefined);
  vi.stubGlobal('Notification', { permission: o.permission ?? 'default', requestPermission: vi.fn().mockImplementation(async function () { (globalThis.Notification as { permission: string }).permission = 'granted'; return 'granted'; }) });
}

// Two distinct 65-byte keys, base64url like a real VAPID public key.
const b64u = (bytes: number[]) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const KEY_A = b64u([4, ...Array(64).fill(1)]);
const KEY_B = b64u([4, ...Array(64).fill(2)]);
const bytesOf = (k: string) => Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)).buffer;

beforeEach(() => {
  localStorage.clear(); getDoc.mockReset(); setDoc.mockReset().mockResolvedValue(undefined); deleteDoc.mockClear();
  _resetPushKey(); getPushConfig.mockReset().mockResolvedValue({ vapidPublicKey: KEY_A });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('pushState', () => {
  it('iPhone in Safari (not standalone) needs the home screen', () => {
    env(IPHONE, { standalone: false, push: false });
    expect(pushState()).toBe('needs-home-screen');
  });
  it('iPhone installed to the home screen is just off', () => {
    env(IPHONE, { standalone: true });
    expect(pushState()).toBe('off');
  });
  it('unsupported without PushManager', () => {
    env(ANDROID, { push: false });
    expect(pushState()).toBe('unsupported');
  });
  it('does not depend on a build-time VAPID key', () => {
    env(ANDROID);
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    expect(pushState()).toBe('off');
  });
  it('denied when permission is denied', () => {
    env(ANDROID, { permission: 'denied' });
    expect(pushState()).toBe('denied');
  });
});

function withSub(sub: unknown) {
  (navigator as unknown as { serviceWorker: unknown }).serviceWorker = { ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(sub) } }) };
}
const SUB = { endpoint: 'https://push.example/abc', options: { applicationServerKey: bytesOf(KEY_A) } };

describe('pushActive', () => {
  beforeEach(() => env(ANDROID, { permission: 'granted' }));
  it('true only when a subscription exists and is registered for this user', async () => {
    withSub(SUB); getDoc.mockResolvedValue({ exists: () => true });
    expect(await pushActive('u1')).toBe(true);
    expect(getDoc.mock.calls[0][0].path).toMatch(/^users\/u1\/pushSubs\/[0-9a-f]{32}$/);
    expect(await resolvePushState('u1')).toBe('on');
  });
  it('off when the browser has no subscription', async () => {
    withSub(null);
    expect(await pushActive('u1')).toBe(false);
    expect(await resolvePushState('u1')).toBe('off');
  });
  it('off when the subscription is registered for another account', async () => {
    withSub(SUB); getDoc.mockResolvedValue({ exists: () => false });
    expect(await resolvePushState('u2')).toBe('off');
  });
  it('off when the subscription was made with a different key than the server\'s', async () => {
    withSub({ ...SUB, options: { applicationServerKey: bytesOf(KEY_B) } }); getDoc.mockResolvedValue({ exists: () => true });
    expect(await pushActive('u1')).toBe(false);
    expect(await resolvePushState('u1')).toBe('off');
  });
  it('fetches the server key once per page load', async () => {
    withSub(SUB); getDoc.mockResolvedValue({ exists: () => true });
    await pushActive('u1'); await pushActive('u1');
    expect(getPushConfig).toHaveBeenCalledTimes(1);
  });
});

describe('isLocalPath', () => {
  it('accepts single-slash paths only', () => {
    expect(isLocalPath('/team/a')).toBe(true);
    expect(isLocalPath('//evil.com')).toBe(false);
    expect(isLocalPath('https://x')).toBe(false);
  });
});

describe('enable / disable', () => {
  it('subscribes and stores the subscription under a sha256 id of the endpoint', async () => {
    env(ANDROID);
    const sub = { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } }), unsubscribe: vi.fn().mockResolvedValue(true) };
    const subscribe = vi.fn().mockResolvedValue(sub);
    (navigator as unknown as { serviceWorker: unknown }).serviceWorker = { ready: Promise.resolve({ pushManager: { subscribe, getSubscription: vi.fn().mockResolvedValue(sub) } }) };
    await enablePush('u1');
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array(bytesOf(KEY_A)) });
    const [ref, data] = setDoc.mock.calls[0];
    expect(ref.path).toMatch(/^users\/u1\/pushSubs\/[0-9a-f]{32}$/);
    expect(data).toMatchObject({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' }, createdAt: 'TS' });
    await disablePush('u1');
    expect(deleteDoc.mock.calls[0][0].path).toBe(ref.path);
    expect(sub.unsubscribe).toHaveBeenCalled();
  });
  it('disable unsubscribes the browser even while the registration delete is still queued (offline)', async () => {
    env(ANDROID);
    const sub = { endpoint: 'https://p/x', unsubscribe: vi.fn().mockResolvedValue(true) };
    (navigator as unknown as { serviceWorker: unknown }).serviceWorker = { ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(sub) } }) };
    deleteDoc.mockReturnValueOnce(new Promise(() => {}));
    void disablePush('u1');
    await vi.waitFor(() => expect(sub.unsubscribe).toHaveBeenCalled());
    expect(deleteDoc).toHaveBeenCalled();
  });

  it('unsubscribes again if registering fails', async () => {
    env(ANDROID);
    const sub = { endpoint: 'https://p/x', toJSON: () => ({ keys: {} }), unsubscribe: vi.fn().mockResolvedValue(true) };
    (navigator as unknown as { serviceWorker: unknown }).serviceWorker = { ready: Promise.resolve({ pushManager: { subscribe: vi.fn().mockResolvedValue(sub) } }) };
    setDoc.mockRejectedValueOnce(new Error('denied'));
    await expect(enablePush('u1')).rejects.toThrow('denied');
    expect(sub.unsubscribe).toHaveBeenCalled();
  });
  it('unsubscribes an existing subscription made with another key before subscribing', async () => {
    env(ANDROID);
    const order: string[] = [];
    const old = { endpoint: 'https://p/old', options: { applicationServerKey: bytesOf(KEY_B) }, unsubscribe: vi.fn(async () => { order.push('unsubscribe'); return true; }) };
    const fresh = { endpoint: 'https://p/new', toJSON: () => ({ keys: { p256dh: 'P', auth: 'A' } }), unsubscribe: vi.fn() };
    const subscribe = vi.fn(async () => { order.push('subscribe'); return fresh; });
    (navigator as unknown as { serviceWorker: unknown }).serviceWorker = { ready: Promise.resolve({ pushManager: { subscribe, getSubscription: vi.fn().mockResolvedValue(old) } }) };
    await enablePush('u1');
    expect(order).toEqual(['unsubscribe', 'subscribe']);
    expect(setDoc.mock.calls[0][1]).toMatchObject({ endpoint: 'https://p/new' });
  });
  it('keeps an existing subscription that already uses the server key', async () => {
    env(ANDROID);
    const same = { endpoint: 'https://p/same', options: { applicationServerKey: bytesOf(KEY_A) }, toJSON: () => ({ keys: { p256dh: 'P', auth: 'A' } }), unsubscribe: vi.fn() };
    const subscribe = vi.fn().mockResolvedValue(same);
    (navigator as unknown as { serviceWorker: unknown }).serviceWorker = { ready: Promise.resolve({ pushManager: { subscribe, getSubscription: vi.fn().mockResolvedValue(same) } }) };
    await enablePush('u1');
    expect(same.unsubscribe).not.toHaveBeenCalled();
  });
  it('rejects when the server key cannot be fetched, without subscribing', async () => {
    env(ANDROID);
    getPushConfig.mockRejectedValue(new Error('offline'));
    const subscribe = vi.fn();
    (navigator as unknown as { serviceWorker: unknown }).serviceWorker = { ready: Promise.resolve({ pushManager: { subscribe, getSubscription: vi.fn().mockResolvedValue(null) } }) };
    await expect(enablePush('u1')).rejects.toThrow('offline');
    expect(subscribe).not.toHaveBeenCalled();
  });
  it('rejects when the user refuses permission', async () => {
    env(ANDROID);
    (Notification.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValue('denied');
    await expect(enablePush('u1')).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });
});

describe('repairPush (app start)', () => {
  function sw(existing: unknown, fresh: unknown) {
    const subscribe = vi.fn().mockResolvedValue(fresh);
    (navigator as unknown as { serviceWorker: unknown }).serviceWorker = { ready: Promise.resolve({ pushManager: { subscribe, getSubscription: vi.fn().mockResolvedValue(existing) } }) };
    return subscribe;
  }
  const fresh = { endpoint: 'https://p/new', toJSON: () => ({ keys: { p256dh: 'P', auth: 'A' } }), unsubscribe: vi.fn() };

  it('does nothing unless permission is already granted', async () => {
    env(ANDROID, { permission: 'default' });
    const subscribe = sw({ ...SUB, unsubscribe: vi.fn() }, fresh);
    await repairPush('u1');
    expect(subscribe).not.toHaveBeenCalled();
    expect(getPushConfig).not.toHaveBeenCalled();
  });
  it('does nothing when the browser has no subscription (the person never turned push on here)', async () => {
    env(ANDROID, { permission: 'granted' });
    const subscribe = sw(null, fresh);
    await repairPush('u1');
    expect(subscribe).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });
  it('leaves a healthy subscription alone', async () => {
    env(ANDROID, { permission: 'granted' });
    const old = { ...SUB, unsubscribe: vi.fn() };
    const subscribe = sw(old, fresh);
    getDoc.mockResolvedValue({ exists: () => true });
    await repairPush('u1');
    expect(subscribe).not.toHaveBeenCalled();
    expect(old.unsubscribe).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });
  it('resubscribes with the server key when the existing subscription used another key', async () => {
    env(ANDROID, { permission: 'granted' });
    const old = { endpoint: 'https://p/old', options: { applicationServerKey: bytesOf(KEY_B) }, unsubscribe: vi.fn().mockResolvedValue(true) };
    const subscribe = sw(old, fresh);
    getDoc.mockResolvedValue({ exists: () => true });
    await repairPush('u1');
    expect(old.unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array(bytesOf(KEY_A)) });
    expect(setDoc.mock.calls[0][0].path).toMatch(/^users\/u1\/pushSubs\/[0-9a-f]{32}$/);
    expect(setDoc.mock.calls[0][1]).toMatchObject({ endpoint: 'https://p/new' });
  });
  it('resubscribes and registers when the registration doc is missing', async () => {
    env(ANDROID, { permission: 'granted' });
    const old = { ...SUB, unsubscribe: vi.fn().mockResolvedValue(true) };
    const subscribe = sw(old, fresh);
    getDoc.mockResolvedValue({ exists: () => false });
    await repairPush('u1');
    expect(subscribe).toHaveBeenCalled();
    expect(setDoc.mock.calls[0][1]).toMatchObject({ endpoint: 'https://p/new' });
  });
  it('never throws: failures are only logged', async () => {
    env(ANDROID, { permission: 'granted' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sw({ ...SUB, unsubscribe: vi.fn() }, fresh);
    getPushConfig.mockRejectedValue(new Error('offline'));
    await expect(repairPush('u1')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
