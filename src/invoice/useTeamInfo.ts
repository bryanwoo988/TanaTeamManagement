import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_CATEGORIES, type MemberDoc, type TeamDoc } from '../../shared/types';

export interface TeamPerson { uid: string; name: string }

/** Live invoice categories (falling back to the defaults while none are saved) and the team's active members. */
export function useTeamInfo(teamId: string): { categories: string[]; members: TeamPerson[] } {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [members, setMembers] = useState<TeamPerson[]>([]);
  useEffect(() => {
    const a = onSnapshot(doc(db, 'teams', teamId), (s) => {
      const c = (s.data() as TeamDoc | undefined)?.categories;
      setCategories(c && c.length ? c : DEFAULT_CATEGORIES);
    }, () => {});
    const b = onSnapshot(collection(db, 'teams', teamId, 'members'), (s) =>
      setMembers(s.docs.map((d) => ({ ...(d.data() as MemberDoc), uid: d.id })).filter((m) => m.status === 'active').map((m) => ({ uid: m.uid, name: m.name }))), () => {});
    return () => { a(); b(); };
  }, [teamId]);
  return { categories, members };
}
