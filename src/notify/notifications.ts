import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, updateDoc, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import type { NotificationDoc } from '../../shared/types';

export type Notice = NotificationDoc & { id: string };

/** The signed-in user's latest 50 notifications, newest first. */
export function useNotifications(uid: string | undefined): Notice[] {
  const [list, setList] = useState<Notice[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(50)),
      (s) => setList(s.docs.map((d) => ({ ...(d.data() as NotificationDoc), id: d.id }))),
      () => {},
    );
  }, [uid]);
  return list;
}

export const markRead = (uid: string, id: string) => updateDoc(doc(db, 'users', uid, 'notifications', id), { read: true });

export async function markAllRead(uid: string, list: Notice[]): Promise<void> {
  const batch = writeBatch(db);
  for (const n of list) if (!n.read) batch.update(doc(db, 'users', uid, 'notifications', n.id), { read: true });
  await batch.commit();
}
