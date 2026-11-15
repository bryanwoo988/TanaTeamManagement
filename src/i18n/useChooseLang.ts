import { doc, updateDoc } from 'firebase/firestore';
import type { Lang } from '../../shared/types';
import { useAuth } from '../auth/AuthProvider';
import { db } from '../firebase';
import { toastError } from '../ui/toast';
import { setLang } from './index';

/** Switch the UI language; when signed in also save it to the profile (spec §6.7: pushes and notices use it). */
export function useChooseLang(): (l: Lang) => void {
  const { user, profile } = useAuth();
  return (l) => {
    setLang(l);
    if (user && profile && profile.lang !== l) updateDoc(doc(db, 'users', user.uid), { lang: l }).catch(() => toastError());
  };
}
