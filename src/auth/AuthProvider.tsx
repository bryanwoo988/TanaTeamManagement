import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { UserDoc } from '../../shared/types';
import { disablePush } from '../notify/push';

export interface AuthState {
  user: User | null;
  /** users/{uid}; null when signed out or the person has not finished profile setup. */
  profile: UserDoc | null;
  loading: boolean;
  /** The profile could not be read (offline/permission); not the same as having no profile. */
  error: boolean;
  retry: () => void;
}

const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true, error: false, retry: () => {} });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

const PUSH_CLEANUP_MS = 3000;

/** Drop this device's push subscription for the signed-in user (so the next person on this device
    gets none of their pushes), then sign out. Cleanup is best effort and capped so an offline
    sign-out never hangs. */
export async function signOut(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (uid && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof PushManager !== 'undefined') {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      disablePush(uid).catch(() => {}),
      new Promise<void>((r) => { timer = setTimeout(r, PUSH_CLEANUP_MS); }),
    ]);
    clearTimeout(timer);
  }
  await fbSignOut(auth);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<UserDoc | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setProfile(undefined);
    setError(false);
    setUser(u);
  }), []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, 'users', user.uid),
      (s) => {
        setError(false);
        setProfile(s.exists() ? (s.data() as UserDoc) : null);
      },
      () => setError(true),
    );
  }, [user, tick]);

  const loading = user === undefined || (user !== null && profile === undefined && !error);
  const value: AuthState = { user: user ?? null, profile: user ? (profile ?? null) : null, loading, error: !!user && error && profile === undefined, retry: () => { setError(false); setTick((n) => n + 1); } };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
