import { onDocumentWritten, onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { getStorage } from 'firebase-admin/storage';
import { db, REGION } from './lib/admin';
import { NOTIFY_SECRETS, notifyUsers } from './notify';
import { formatRM } from '../../shared/money';
import { klDate } from '../../shared/dates';
import { notifyUrl } from '../../shared/notifyUrls';
import type { EventDoc, InvoiceDoc, MemberDoc, UserTeamDoc } from '../../shared/types';

/** Sets the member's name in one team to their own profile name; a membership gone since is skipped. */
async function syncMemberName(teamId: string, uid: string, name: string): Promise<void> {
  try {
    await db.doc(`teams/${teamId}/members/${uid}`).update({ name });
  } catch (e: any) {
    if (e?.code !== 5) throw e; // NOT_FOUND: left or removed since the mirror was written
  }
}

/**
 * Single writer of users/{uid}/teams/{teamId}; also raises joinRequest / joined notifications.
 * A membership made before the person had a profile (phone invite, Auth-only add) carries the
 * admin-typed name; when a profile name exists and differs, the member doc takes it (spec §6.2).
 */
export const onMemberWrite = onDocumentWritten(
  { document: 'teams/{teamId}/members/{uid}', region: REGION, secrets: NOTIFY_SECRETS },
  async (event) => {
    const { teamId, uid } = event.params;
    const before = event.data?.before.exists ? (event.data.before.data() as MemberDoc) : undefined;
    const after = event.data?.after.exists ? (event.data.after.data() as MemberDoc) : undefined;
    const mirror = db.doc(`users/${uid}/teams/${teamId}`);
    // Events can arrive late or be retried: mirror from the CURRENT member and team docs, not the event snapshot.
    const [memberNow, team, profile] = await Promise.all([
      db.doc(`teams/${teamId}/members/${uid}`).get(), db.doc(`teams/${teamId}`).get(), db.doc(`users/${uid}`).get(),
    ]);
    if (!memberNow.exists || !team.exists) await mirror.delete();
    else {
      const m = memberNow.data() as MemberDoc;
      const doc: UserTeamDoc = {
        teamId, name: team.get('name') as string, role: m.role, status: m.status,
        ...(typeof m.canUpload === 'boolean' ? { canUpload: m.canUpload } : {}),
      };
      await mirror.set(doc);
      const profileName = profile.get('name');
      if (typeof profileName === 'string' && profileName.trim() && profileName !== m.name) await syncMemberName(teamId, uid, profileName);
    }
    if (!after || !team.exists) return;
    const teamName = team.get('name') as string;

    if (!before && after.status === 'pending') {
      const admins = await db.collection(`teams/${teamId}/members`).where('role', '==', 'admin').where('status', '==', 'active').get();
      await notifyUsers(admins.docs.map((d) => d.id), { kind: 'joinRequest', id: `${event.id}_joinRequest`, teamId, refId: uid, vars: { name: after.name, team: teamName }, url: notifyUrl.members(teamId) });
    } else if (after.status === 'active' && (before ? before.status === 'pending' : team.get('createdBy') !== uid)) {
      await notifyUsers([uid], { kind: 'joined', id: `${event.id}_joined`, teamId, vars: { team: teamName }, url: notifyUrl.calendar(teamId) });
    }
  },
);

/**
 * When a profile is created or renamed, every membership (found through the users/{uid}/teams mirror)
 * takes the person's own name. Members cannot write their member doc, so this is the only path.
 * Memberships not mirrored yet are covered by onMemberWrite, which also copies the profile name.
 */
export const onUserWrite = onDocumentWritten(
  { document: 'users/{uid}', region: REGION },
  async (event) => {
    const { uid } = event.params;
    const before = event.data?.before.exists ? event.data.before.get('name') : undefined;
    const after = event.data?.after.exists ? event.data.after.get('name') : undefined;
    if (typeof after !== 'string' || !after.trim() || after === before) return;
    // A late or retried delivery must not restore an older name: use the profile as it is now.
    const now = (await db.doc(`users/${uid}`).get()).get('name');
    if (typeof now !== 'string' || !now.trim()) return;
    const teams = await db.collection(`users/${uid}/teams`).get();
    await Promise.all(teams.docs.map(async (t) => {
      const m = await db.doc(`teams/${t.id}/members/${uid}`).get();
      if (m.exists && m.get('name') !== now) await syncMemberName(t.id, uid, now);
    }));
  },
);

const teamName = async (teamId: string) => ((await db.doc(`teams/${teamId}`).get()).get('name') as string | undefined) ?? '';
const when = (e: Pick<EventDoc, 'date' | 'allDay' | 'start'>) => (e.allDay || !e.start ? e.date : `${e.date} ${e.start}`);
const calendarUrl = (teamId: string, date: string) => notifyUrl.calendar(teamId, date);
const timeChanged = (a: EventDoc, b: EventDoc) =>
  a.date !== b.date || a.start !== b.start || a.end !== b.end || a.allDay !== b.allDay;
const BATCH_TTL_MS = 2 * 86_400_000;

/**
 * Copies written in one batch share a batchId and fire one trigger each. The first trigger to create
 * notifyBatches/{teamId}_{batchId} sends a single 'assigned' covering every copy; the others stop.
 * (The id is team-scoped so a batchId reused in another team cannot swallow its notifications.)
 */
async function notifyBatch(teamId: string, e: EventDoc): Promise<void> {
  try {
    await db.doc(`notifyBatches/${teamId}_${e.batchId}`).create({ expiresAt: new Date(Date.now() + BATCH_TTL_MS) });
  } catch (err: any) {
    if (err?.code === 6) return; // ALREADY_EXISTS: another copy's trigger is sending.
    throw err;
  }
  const copies = (await db.collection(`teams/${teamId}/events`).where('batchId', '==', e.batchId).get()).docs
    .map((d) => d.data() as EventDoc)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = copies[0] ?? e;
  await notifyUsers(e.assignees, {
    kind: 'assigned', id: `batch_${teamId}_${e.batchId}`, teamId, refId: `batch_${e.batchId}`,
    vars: { title: e.title, team: await teamName(teamId), when: when(first), count: Math.max(copies.length, 1) },
    url: calendarUrl(teamId, first.date),
  }, { exclude: e.createdBy });
}

/**
 * Shared-calendar notifications: 'assigned' to newly added assignees (not the editor); 'changed' to
 * assignees who stay on an event whose date/time moved; the cancelled variant of 'changed'
 * (vars.cancelled = 1, "Work cancelled") to assignees removed from an event or on a deleted event.
 * Dates are KL time: on update, 'assigned'/'changed' are skipped when the new date is past; the cancelled
 * variant (delete or removal) is skipped when the old date is past. A past event moved to the future notifies.
 * The editor of a create is createdBy; for update/delete it is the write's auth context (authId).
 * Doc ids are `${event.id}_${variant}` so a repeated delivery of the same event notifies once.
 */
export const onEventWrite = onDocumentWrittenWithAuthContext(
  { document: 'teams/{teamId}/events/{eventId}', region: REGION, secrets: NOTIFY_SECRETS },
  async (event) => {
    const { teamId, eventId } = event.params;
    const before = event.data?.before.exists ? (event.data.before.data() as EventDoc) : undefined;
    const after = event.data?.after.exists ? (event.data.after.data() as EventDoc) : undefined;
    // For an app user authId is their uid; for other principals it never matches a uid, so excluding it is harmless.
    const actor = event.authId;
    const today = klDate(new Date());
    const base = async (e: EventDoc, extra: Record<string, number> = {}) => ({
      teamId, refId: eventId, vars: { title: e.title, team: await teamName(teamId), when: when(e), ...extra }, url: calendarUrl(teamId, e.date),
    });

    if (!before && after) {
      if (after.batchId) return notifyBatch(teamId, after);
      return notifyUsers(after.assignees, { kind: 'assigned', id: `${event.id}_assigned`, ...(await base(after)) }, { exclude: after.createdBy });
    }
    if (before && !after) {
      if (before.date < today) return;
      return notifyUsers(before.assignees, { kind: 'changed', id: `${event.id}_cancelled`, ...(await base(before, { cancelled: 1 })) }, { exclude: actor });
    }
    if (!before || !after) return;
    // News about the event as it now stands needs a future date; a cancellation needs the old one to be.
    const nowPast = after.date < today;
    const wasPast = before.date < today;
    const added = nowPast ? [] : after.assignees.filter((u) => !before.assignees.includes(u));
    const removed = wasPast ? [] : before.assignees.filter((u) => !after.assignees.includes(u));
    const stayed = !nowPast && timeChanged(before, after) ? after.assignees.filter((u) => before.assignees.includes(u)) : [];
    if (!added.length && !stayed.length && !removed.length) return;
    await Promise.all([
      added.length && notifyUsers(added, { kind: 'assigned', id: `${event.id}_assigned`, ...(await base(after)) }, { exclude: actor }),
      stayed.length && notifyUsers(stayed, { kind: 'changed', id: `${event.id}_changed`, ...(await base(after)) }, { exclude: actor }),
      removed.length && notifyUsers(removed, { kind: 'changed', id: `${event.id}_cancelled`, ...(await base(before, { cancelled: 1 })) }, { exclude: actor }),
    ]);
  },
);

async function activeWithRoles(teamId: string, roles: string[]): Promise<string[]> {
  const snap = await db.collection(`teams/${teamId}/members`).where('role', 'in', roles).where('status', '==', 'active').get();
  return snap.docs.map((d) => d.id);
}

/**
 * Invoice notifications: a company invoice goes to admins and the staff ticked on it, and an edit of one
 * to the staff newly ticked (not the editor, from the write's auth context); a claim submitted
 * (or resubmitted: rejected -> pending) goes to admins and finance; a processed claim goes to its uploader.
 * The uploader never hears about their own upload.
 */
export const onInvoiceWrite = onDocumentWrittenWithAuthContext(
  { document: 'teams/{teamId}/invoices/{invoiceId}', region: REGION, secrets: NOTIFY_SECRETS },
  async (event) => {
    const { teamId, invoiceId } = event.params;
    const before = event.data?.before.exists ? (event.data.before.data() as InvoiceDoc) : undefined;
    const after = event.data?.after.exists ? (event.data.after.data() as InvoiceDoc) : undefined;
    if (!after) return;
    const url = notifyUrl.invoice(teamId, invoiceId);
    const vars = async () => ({ team: await teamName(teamId), name: after.uploaderName, amount: formatRM(after.amountSen), vendor: after.vendor });
    const exclude = { exclude: after.uploadedBy };

    if (after.kind === 'company') {
      const n = { kind: 'companyInvoice' as const, id: `${event.id}_companyInvoice`, teamId, refId: invoiceId, url };
      if (before) {
        const was = before.relatedUids ?? [];
        const added = (after.relatedUids ?? []).filter((u) => !was.includes(u) && u !== event.authId);
        if (!added.length) return;
        return notifyUsers(added, { ...n, vars: await vars() }, exclude);
      }
      const admins = await activeWithRoles(teamId, ['admin']);
      return notifyUsers([...admins, ...(after.relatedUids ?? [])], { ...n, vars: await vars() }, exclude);
    }
    if (after.status === before?.status) return;
    if (after.status === 'pending') {
      const staff = await activeWithRoles(teamId, ['admin', 'finance']);
      return notifyUsers(staff, { kind: 'claimSubmitted', id: `${event.id}_claimSubmitted`, teamId, refId: invoiceId, vars: await vars(), url }, exclude);
    }
    if (before && (after.status === 'reimbursed' || after.status === 'rejected')) {
      return notifyUsers([after.uploadedBy], {
        kind: 'claimDone', id: `${event.id}_claimDone`, teamId, refId: invoiceId,
        vars: { ...(await vars()), status: after.status, reason: after.rejectReason ?? '' }, url,
      });
    }
  },
);

/**
 * Invoice photo cleanup (storage rules forbid client deletes): removes the Storage photo when an invoice
 * doc is deleted, and the OLD photo when photoPath changes (a replacement is a new file + new path).
 * Missing files are ignored so retried deliveries are harmless.
 */
export const onInvoicePhotoCleanup = onDocumentWritten(
  { document: 'teams/{teamId}/invoices/{invoiceId}', region: REGION },
  async (event) => {
    const before = event.data?.before.exists ? (event.data.before.data() as InvoiceDoc) : undefined;
    const after = event.data?.after.exists ? (event.data.after.data() as InvoiceDoc) : undefined;
    const old = before?.photoPath;
    if (!old || old === after?.photoPath) return;
    // Only ever delete inside this invoice's own folder.
    const { teamId, invoiceId } = event.params;
    if (!old.startsWith(`teams/${teamId}/invoices/${invoiceId}/`)) return;
    await getStorage().bucket().file(old).delete({ ignoreNotFound: true });
  },
);
