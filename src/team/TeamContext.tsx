import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { isActive } from '../../shared/access';
import type { MemberDoc, UserTeamDoc } from '../../shared/types';

export interface TeamState {
  teams: UserTeamDoc[];
  /** A team id, or 'personal'. */
  current: string | 'personal';
  setCurrent: (id: string) => void;
  /** The signed-in user's own record in a team (role/status/canUpload), from the users/{uid}/teams index. */
  member: (teamId: string) => MemberDoc | undefined;
}

const Ctx = createContext<TeamState>({ teams: [], current: 'personal', setCurrent: () => {}, member: () => undefined });

export const useTeams = () => useContext(Ctx);

/** The saved scope, or null when the person never chose one on this device. */
function readStored(): string | null {
  try { return localStorage.getItem('team') || null; } catch { return null; }
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [teams, setTeams] = useState<UserTeamDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [stored, setStored] = useState<string | null>(readStored);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(db, 'users', uid, 'teams'),
      (s) => {
        setTeams(s.docs.map((d) => ({ ...(d.data() as UserTeamDoc), teamId: d.id })));
        setLoaded(true);
      },
      () => setLoaded(true),
    );
  }, [uid]);

  const setCurrent = useCallback((id: string) => {
    setStored(id);
    try { localStorage.setItem('team', id); } catch { /* keep in memory only */ }
  }, []);

  const value = useMemo<TeamState>(() => {
    const member = (teamId: string) => {
      const t = teams.find((x) => x.teamId === teamId);
      // joinedAt is not part of the index; callers only read role/status.
      return t && ({ uid: uid ?? '', name: t.name, role: t.role, status: t.status, ...(t.canUpload !== undefined ? { canUpload: t.canUpload } : {}) } as MemberDoc);
    };
    let current: string;
    if (stored === null) {
      // Never chose: someone in exactly one active team lands in it (BottomNav then shows its Invoices tab).
      const active = loaded ? teams.filter(isActive) : [];
      current = active.length === 1 ? active[0].teamId : 'personal';
    } else {
      // Until the index has loaded keep the saved choice; afterwards it must be a team we are active in.
      const valid = stored === 'personal' || !loaded || isActive(teams.find((t) => t.teamId === stored));
      current = valid ? stored : 'personal';
    }
    return { teams, current, setCurrent, member };
  }, [teams, stored, loaded, uid, setCurrent]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
