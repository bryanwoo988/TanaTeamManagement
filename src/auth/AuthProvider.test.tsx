import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

let authCb: (u: unknown) => void = () => {};
let snapCb: (s: unknown) => void = () => {};
let snapErr: () => void = () => {};
const { fbAuth, fbSignOut, disablePush } = vi.hoisted(() => ({
  fbAuth: { currentUser: null } as { currentUser: { uid: string } | null },
  fbSignOut: vi.fn(),
  disablePush: vi.fn(),
}));
vi.mock('../firebase', () => ({ auth: fbAuth, db: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => { authCb = cb; return () => {}; },
  signOut: (...a: unknown[]) => fbSignOut(...a),
}));
vi.mock('../notify/push', () => ({ disablePush: (...a: unknown[]) => disablePush(...a) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
  onSnapshot: (_ref: unknown, cb: (s: unknown) => void, err?: () => void) => { snapCb = cb; snapErr = err ?? (() => {}); return () => {}; },
}));

import { AuthProvider, signOut, useAuth } from './AuthProvider';

function Probe() {
  const { user, profile, loading, error } = useAuth();
  return <p data-testid="s">{`${loading ? 'loading' : 'ready'}|${user?.uid ?? '-'}|${profile?.name ?? '-'}${error ? '|error' : ''}`}</p>;
}
const state = () => screen.getByTestId('s').textContent;

beforeEach(() => vi.clearAllMocks());

describe('AuthProvider', () => {
  it('is loading until auth resolves, then signed out', () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(state()).toBe('loading|-|-');
    act(() => authCb(null));
    expect(state()).toBe('ready|-|-');
  });

  it('stays loading until the profile snapshot arrives; missing doc gives null profile', () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => authCb({ uid: 'u1' }));
    expect(state()).toBe('loading|u1|-');
    act(() => snapCb({ exists: () => false }));
    expect(state()).toBe('ready|u1|-');
  });

  it('exposes the profile document', () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => authCb({ uid: 'u1' }));
    act(() => snapCb({ exists: () => true, data: () => ({ name: 'Ali' }) }));
    expect(state()).toBe('ready|u1|Ali');
  });

  it('a profile read error is an error state, not a missing profile', () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => authCb({ uid: 'u1' }));
    act(() => snapErr());
    expect(state()).toBe('ready|u1|-|error');
  });
});

describe('signOut', () => {
  beforeEach(() => {
    fbSignOut.mockReset().mockResolvedValue(undefined);
    disablePush.mockReset().mockResolvedValue(undefined);
    fbAuth.currentUser = { uid: 'u1' };
    vi.stubGlobal('PushManager', class {});
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it('removes this device push subscription for the user before signing out', async () => {
    const order: string[] = [];
    disablePush.mockImplementation(async () => { order.push('disable'); });
    fbSignOut.mockImplementation(async () => { order.push('signOut'); });
    await signOut();
    expect(disablePush).toHaveBeenCalledWith('u1');
    expect(order).toEqual(['disable', 'signOut']);
  });

  it('still signs out when removing the subscription fails', async () => {
    disablePush.mockRejectedValue(new Error('offline'));
    await signOut();
    expect(fbSignOut).toHaveBeenCalled();
  });

  it('does not hang when removing the subscription never settles', async () => {
    vi.useFakeTimers();
    disablePush.mockReturnValue(new Promise(() => {}));
    const p = signOut();
    await vi.advanceTimersByTimeAsync(3000);
    await p;
    expect(fbSignOut).toHaveBeenCalled();
  });

  it('skips push cleanup where push is unsupported', async () => {
    vi.stubGlobal('PushManager', undefined);
    await signOut();
    expect(disablePush).not.toHaveBeenCalled();
    expect(fbSignOut).toHaveBeenCalled();
  });
});
