import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { UserDoc } from '../../shared/types';

export interface AuthState {
  user: User | null;
  /** users/{uid}; null when signed out or the person has not finished profile setup. */
  profile: UserDoc | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export const signOut = () => fbSignOut(auth);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<UserDoc | null | undefined>(undefined);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setProfile(undefined);
    setUser(u);
  }), []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, 'users', user.uid),
      (s) => setProfile(s.exists() ? (s.data() as UserDoc) : null),
      () => setProfile(null),
    );
  }, [user]);

  const loading = user === undefined || (user !== null && profile === undefined);
  const value: AuthState = { user: user ?? null, profile: user ? (profile ?? null) : null, loading };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
