import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

let authCb: (u: unknown) => void = () => {};
let snapCb: (s: unknown) => void = () => {};
vi.mock('../firebase', () => ({ auth: {}, db: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => { authCb = cb; return () => {}; },
  signOut: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
  onSnapshot: (_ref: unknown, cb: (s: unknown) => void) => { snapCb = cb; return () => {}; },
}));

import { AuthProvider, useAuth } from './AuthProvider';

function Probe() {
  const { user, profile, loading } = useAuth();
  return <p data-testid="s">{`${loading ? 'loading' : 'ready'}|${user?.uid ?? '-'}|${profile?.name ?? '-'}`}</p>;
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
});
