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
  /** The signed-in user's own record in a team (role/status), from the users/{uid}/teams index. */
  member: (teamId: string) => MemberDoc | undefined;
}

const Ctx = createContext<TeamState>({ teams: [], current: 'personal', setCurrent: () => {}, member: () => undefined });

export const useTeams = () => useContext(Ctx);

function readStored(): string {
  try { return localStorage.getItem('team') || 'personal'; } catch { return 'personal'; }
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [teams, setTeams] = useState<UserTeamDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [stored, setStored] = useState(readStored);

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
      return t && ({ uid: uid ?? '', name: t.name, role: t.role, status: t.status } as MemberDoc);
    };
    // Until the index has loaded keep the saved choice; afterwards it must be a team we are active in.
    const valid = stored === 'personal' || !loaded || isActive(teams.find((t) => t.teamId === stored));
    return { teams, current: valid ? stored : 'personal', setCurrent, member };
  }, [teams, stored, loaded, uid, setCurrent]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
