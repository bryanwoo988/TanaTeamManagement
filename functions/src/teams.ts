import { db, FieldValue } from './lib/admin';
import type { PhoneInviteDoc } from '../../shared/types';

/**
 * Turn every phone invite for this number into an active membership, then delete the invite.
 * Idempotent: safe on every login, and picks up invites created after the first login.
 * The profile doc may not exist yet at first login, so fall back to the invite's name.
 */
export async function claimPhoneInvites(uid: string, e164: string): Promise<number> {
  const invites = await db.collection('phoneInvites').where('phone', '==', e164).get();
  if (invites.empty) return 0;
  const profileName = (await db.doc(`users/${uid}`).get()).get('name');
  for (const doc of invites.docs) {
    const inv = doc.data() as PhoneInviteDoc;
    const name = typeof profileName === 'string' && profileName.trim() ? profileName : inv.name;
    await db.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(doc.ref);
      if (!inviteSnap.exists) return; // revoked since the query
      const memberRef = db.doc(`teams/${inv.teamId}/members/${uid}`);
      const memberSnap = await tx.get(memberRef);
      if (!memberSnap.exists) {
        const member = { uid, name, role: inv.role, status: 'active', joinedAt: FieldValue.serverTimestamp() };
        tx.set(memberRef, member);
      } // an existing member keeps their role and joinedAt
      tx.delete(doc.ref);
    });
  }
  return invites.size;
}
