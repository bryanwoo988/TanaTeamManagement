import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setDoc = vi.fn().mockResolvedValue(undefined);
const deleteDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
  setDoc: (...a: unknown[]) => setDoc(...a),
  deleteDoc: (...a: unknown[]) => deleteDoc(...a),
  serverTimestamp: () => 'TS',
}));

import { disablePush, enablePush, pushState } from './push';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36';

function env(ua: string, o: { standalone?: boolean; permission?: string; push?: boolean } = {}) {
  vi.stubGlobal('navigator', { userAgent: ua, standalone: o.standalone, serviceWorker: {} });
  vi.stubGlobal('matchMedia', undefined);
  if (o.push !== false) vi.stubGlobal('PushManager', class {});
  else vi.stubGlobal('PushManager', undefined);
  vi.stubGlobal('Notification', { permission: o.permission ?? 'default', requestPermission: vi.fn().mockImplementation(async function () { (globalThis.Notification as { permission: string }).permission = 'granted'; return 'granted'; }) });
}

beforeEach(() => { localStorage.clear(); vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BNc'); setDoc.mockClear(); deleteDoc.mockClear(); });
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
  it('unsupported without a VAPID key or without PushManager', () => {
    env(ANDROID);
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    expect(pushState()).toBe('unsupported');
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BNc');
    env(ANDROID, { push: false });
    expect(pushState()).toBe('unsupported');
  });
  it('denied when permission is denied', () => {
    env(ANDROID, { permission: 'denied' });
    expect(pushState()).toBe('denied');
  });
  it('on only when permission is granted and we subscribed', () => {
    env(ANDROID, { permission: 'granted' });
    expect(pushState()).toBe('off');
    localStorage.setItem('pushOn', '1');
    expect(pushState()).toBe('on');
  });
});

describe('enable / disable', () => {
  it('subscribes and stores the subscription under a sha256 id of the endpoint', async () => {
    env(ANDROID);
    const sub = { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } }), unsubscribe: vi.fn().mockResolvedValue(true) };
    const subscribe = vi.fn().mockResolvedValue(sub);
    (navigator as unknown as { serviceWorker: unknown }).serviceWorker = { ready: Promise.resolve({ pushManager: { subscribe, getSubscription: vi.fn().mockResolvedValue(sub) } }) };
    await enablePush('u1');
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.anything() }));
    const [ref, data] = setDoc.mock.calls[0];
    expect(ref.path).toMatch(/^users\/u1\/pushSubs\/[0-9a-f]{32}$/);
    expect(data).toMatchObject({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' }, createdAt: 'TS' });
    expect(pushState()).toBe('on');
    await disablePush('u1');
    expect(deleteDoc.mock.calls[0][0].path).toBe(ref.path);
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(pushState()).toBe('off');
  });
  it('rejects when the user refuses permission', async () => {
    env(ANDROID);
    (Notification.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValue('denied');
    await expect(enablePush('u1')).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });
});
