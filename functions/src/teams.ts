import { db, FieldValue } from './lib/admin';
import type { MemberDoc, PhoneInviteDoc, UserTeamDoc } from '../../shared/types';

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
    const member: Omit<MemberDoc, 'joinedAt'> & { joinedAt: FieldValue } = {
      uid, name, role: inv.role, status: 'active', joinedAt: FieldValue.serverTimestamp(),
    };
    const userTeam: UserTeamDoc = { teamId: inv.teamId, name: inv.teamName, role: inv.role, status: 'active' };
    const batch = db.batch();
    batch.set(db.doc(`teams/${inv.teamId}/members/${uid}`), member);
    batch.set(db.doc(`users/${uid}/teams/${inv.teamId}`), userTeam);
    batch.delete(doc.ref);
    await batch.commit();
  }
  return invites.size;
}
