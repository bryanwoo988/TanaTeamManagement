import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import type { Transaction } from 'firebase-admin/firestore';
import { db, FieldValue, REGION } from './lib/admin';
import { requireAdmin, requireProfile, requireRole, requireString } from './lib/profile';
import { secureRandom } from './lib/random';
import { newInviteCode, normalizeInviteCode } from '../../shared/inviteCode';
import { normalizeMyPhone } from '../../shared/phone';
import { DEFAULT_CATEGORIES, type PhoneInviteDoc } from '../../shared/types';

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

const CALLABLE = { region: REGION, invoker: 'public' as const };

/** Reserve a fresh invite code for the team inside a transaction; retry on collision. */
async function allocateCode(tx: Transaction, teamId: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = newInviteCode(secureRandom);
    const ref = db.doc(`inviteCodes/${code}`);
    if (!(await tx.get(ref)).exists) {
      tx.set(ref, { teamId, createdAt: FieldValue.serverTimestamp() });
      return code;
    }
  }
  throw new HttpsError('resource-exhausted', 'team.codeCollision');
}

export const createTeam = onCall(CALLABLE, async (request) => {
  const { uid, user } = await requireProfile(request);
  const name = requireString(request.data?.name, 1, 60, 'team.badName');
  const teamRef = db.collection('teams').doc();
  const code = await db.runTransaction(async (tx) => {
    const code = await allocateCode(tx, teamRef.id);
    tx.set(teamRef, { name, createdBy: uid, categories: DEFAULT_CATEGORIES, createdAt: FieldValue.serverTimestamp() });
    tx.set(teamRef.collection('members').doc(uid), {
      uid, name: user.name, role: 'admin', status: 'active', joinedAt: FieldValue.serverTimestamp(),
    });
    return code;
  });
  return { teamId: teamRef.id, code };
});

export const joinTeam = onCall(CALLABLE, async (request) => {
  const { uid, user } = await requireProfile(request);
  const code = normalizeInviteCode(typeof request.data?.code === 'string' ? request.data.code : '');
  if (!code) throw new HttpsError('not-found', 'team.badCode');
  const invite = await db.doc(`inviteCodes/${code}`).get();
  if (!invite.exists) throw new HttpsError('not-found', 'team.badCode');
  const teamId = invite.get('teamId') as string;
  const status = await db.runTransaction(async (tx) => {
    const ref = db.doc(`teams/${teamId}/members/${uid}`);
    const existing = await tx.get(ref);
    if (existing.exists) return existing.get('status') as 'pending' | 'active';
    tx.set(ref, { uid, name: user.name, role: 'member', status: 'pending', joinedAt: FieldValue.serverTimestamp() });
    return 'pending' as const;
  });
  return { teamId, status };
});

async function codeFor(teamId: string, tx?: Transaction) {
  const q = db.collection('inviteCodes').where('teamId', '==', teamId);
  return tx ? tx.get(q) : q.get();
}

export const getInviteCode = onCall(CALLABLE, async (request) => {
  const { uid } = await requireProfile(request);
  const teamId = await requireAdmin(request.data?.teamId, uid);
  const snap = await codeFor(teamId);
  if (snap.empty) throw new HttpsError('not-found', 'team.noCode');
  return { code: snap.docs[0].id };
});

export const resetInviteCode = onCall(CALLABLE, async (request) => {
  const { uid } = await requireProfile(request);
  const teamId = await requireAdmin(request.data?.teamId, uid);
  const code = await db.runTransaction(async (tx) => {
    const old = await codeFor(teamId, tx);
    const code = await allocateCode(tx, teamId);
    old.docs.forEach((d) => tx.delete(d.ref));
    return code;
  });
  return { code };
});

export const addMemberByPhone = onCall(CALLABLE, async (request) => {
  const { uid } = await requireProfile(request);
  const teamId = await requireAdmin(request.data?.teamId, uid);
  const p = normalizeMyPhone(typeof request.data?.phone === 'string' ? request.data.phone : '');
  if (!p.ok) throw new HttpsError('invalid-argument', 'login.invalidPhone');
  const name = requireString(request.data?.name, 1, 80, 'team.badName');
  const role = requireRole(request.data?.role);
  const teamName = (await db.doc(`teams/${teamId}`).get()).get('name') as string;
  const inviteRef = db.doc(`phoneInvites/${teamId}_${p.e164}`);
  let targetUid: string | null = null;
  try {
    targetUid = (await getAuth().getUserByPhoneNumber(p.e164)).uid;
  } catch (e: any) {
    if (e?.code !== 'auth/user-not-found') throw e;
  }
  if (targetUid) {
    const target = targetUid;
    const memberRef = db.doc(`teams/${teamId}/members/${target}`);
    const profileName = (await db.doc(`users/${target}`).get()).get('name');
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(memberRef);
      if (!existing.exists) {
        tx.set(memberRef, { uid: target, name: typeof profileName === 'string' && profileName ? profileName : name, role, status: 'active', joinedAt: FieldValue.serverTimestamp() });
      } else if (existing.get('status') === 'pending') {
        tx.update(memberRef, { status: 'active', role }); // admin vouches for a pending requester
      } // an active member keeps their role
      tx.delete(inviteRef);
    });
    return { status: 'added' as const };
  }
  await inviteRef.set({
    teamId, teamName, phone: p.e164, name, role, createdBy: uid, createdAt: FieldValue.serverTimestamp(),
  });
  return { status: 'invited' as const };
});

export const cancelPhoneInvite = onCall(CALLABLE, async (request) => {
  const { uid } = await requireProfile(request);
  const teamId = await requireAdmin(request.data?.teamId, uid);
  const p = normalizeMyPhone(typeof request.data?.phone === 'string' ? request.data.phone : '');
  if (!p.ok) throw new HttpsError('invalid-argument', 'login.invalidPhone');
  await db.doc(`phoneInvites/${teamId}_${p.e164}`).delete();
  return {};
});

export const leaveTeam = onCall(CALLABLE, async (request) => {
  const { uid } = await requireProfile(request);
  const teamId = request.data?.teamId;
  if (typeof teamId !== 'string' || !teamId) throw new HttpsError('invalid-argument', 'team.badTeam');
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`teams/${teamId}/members/${uid}`);
    const me = await tx.get(ref);
    if (!me.exists) return;
    if (me.get('role') === 'admin' && me.get('status') === 'active') {
      const admins = await tx.get(
        db.collection(`teams/${teamId}/members`).where('role', '==', 'admin').where('status', '==', 'active'),
      );
      if (admins.size <= 1) throw new HttpsError('failed-precondition', 'team.lastAdmin');
    }
    tx.delete(ref);
  });
  return {};
});
