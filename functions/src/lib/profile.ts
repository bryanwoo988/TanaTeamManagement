import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { db } from './admin';
import { requireAuth } from './auth';
import type { Role, UserDoc } from '../../../shared/types';

/** Signed in AND has a profile doc. Returns the uid and profile. */
export async function requireProfile(request: CallableRequest): Promise<{ uid: string; user: UserDoc }> {
  const uid = requireAuth(request);
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'profile.missing');
  return { uid, user: snap.data() as UserDoc };
}

export function requireString(raw: unknown, min: number, max: number, key: string): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s.length < min || s.length > max) throw new HttpsError('invalid-argument', key);
  return s;
}

export function requireRole(raw: unknown): Role {
  if (raw === 'admin' || raw === 'finance' || raw === 'member') return raw;
  throw new HttpsError('invalid-argument', 'team.badRole');
}

export async function requireAdmin(teamId: unknown, uid: string): Promise<string> {
  if (typeof teamId !== 'string' || !teamId) throw new HttpsError('invalid-argument', 'team.badTeam');
  const m = await db.doc(`teams/${teamId}/members/${uid}`).get();
  if (!m.exists || m.get('role') !== 'admin' || m.get('status') !== 'active') {
    throw new HttpsError('permission-denied', 'team.adminOnly');
  }
  return teamId;
}
