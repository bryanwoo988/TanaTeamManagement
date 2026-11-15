import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db, REGION } from './lib/admin';
import { notifyUsers } from './notify';
import type { MemberDoc, UserTeamDoc } from '../../shared/types';

/** Single writer of users/{uid}/teams/{teamId}; also raises joinRequest / joined notifications. */
export const onMemberWrite = onDocumentWritten(
  { document: 'teams/{teamId}/members/{uid}', region: REGION },
  async (event) => {
    const { teamId, uid } = event.params;
    const before = event.data?.before.exists ? (event.data.before.data() as MemberDoc) : undefined;
    const after = event.data?.after.exists ? (event.data.after.data() as MemberDoc) : undefined;
    const mirror = db.doc(`users/${uid}/teams/${teamId}`);
    if (!after) {
      await mirror.delete();
      return;
    }
    const team = await db.doc(`teams/${teamId}`).get();
    if (!team.exists) return; // team being deleted
    const teamName = team.get('name') as string;
    const doc: UserTeamDoc = { teamId, name: teamName, role: after.role, status: after.status };
    await mirror.set(doc);

    const url = `/team/${teamId}`;
    if (!before && after.status === 'pending') {
      const admins = await db.collection(`teams/${teamId}/members`).where('role', '==', 'admin').where('status', '==', 'active').get();
      await notifyUsers(admins.docs.map((d) => d.id), { kind: 'joinRequest', teamId, refId: uid, vars: { name: after.name, team: teamName }, url: `${url}/members` });
    } else if (after.status === 'active' && (before ? before.status === 'pending' : team.get('createdBy') !== uid)) {
      await notifyUsers([uid], { kind: 'joined', teamId, vars: { team: teamName }, url });
    }
  },
);
