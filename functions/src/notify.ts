import { defineSecret, defineString } from 'firebase-functions/params';
import * as webpush from 'web-push';
import { db, FieldValue, IS_EMULATOR } from './lib/admin';
import { notifyText } from '../../shared/notifyText';
import { MANDATORY_KINDS, type Lang, type MemberDoc, type NotifyKind, type PushSubDoc, type UserDoc } from '../../shared/types';

const VAPID_PUBLIC_KEY = defineSecret('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = defineString('VAPID_SUBJECT');
/** Every function that calls notifyUsers must declare these. */
export const NOTIFY_SECRETS = [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY];

export interface Notification {
  kind: NotifyKind;
  teamId?: string;
  refId?: string;
  vars: Record<string, string | number>;
  url: string;
}

/** Delivers one push message; on failure throws an error carrying the push service's HTTP `statusCode`. */
export type PushSender = (sub: PushSubDoc, payload: string, uid: string) => Promise<void>;

let vapidReady = false;
const webPushSender: PushSender = async (sub, payload) => {
  if (!vapidReady) {
    webpush.setVapidDetails(VAPID_SUBJECT.value(), VAPID_PUBLIC_KEY.value(), VAPID_PRIVATE_KEY.value());
    vapidReady = true;
  }
  await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 24 * 3600 });
};

/** Local emulator only: never contacts a push service. Endpoints containing '/gone' act expired. */
const emulatorSender: PushSender = async (sub, payload, uid) => {
  if (sub.endpoint.includes('/gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
  await db.collection('_pushLog').add({ uid, endpoint: sub.endpoint, payload });
};

const sendPush: PushSender = IS_EMULATOR ? emulatorSender : webPushSender;

async function pushAll(uid: string, payload: string): Promise<void> {
  const subs = await db.collection(`users/${uid}/pushSubs`).get();
  await Promise.all(subs.docs.map(async (s) => {
    try {
      await sendPush(s.data() as PushSubDoc, payload, uid);
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await s.ref.delete();
      else console.error('push failed', uid, s.id, e?.statusCode, e?.message);
    }
  }));
}

async function notifyOne(uid: string, n: Notification): Promise<void> {
  const [user, member] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    n.teamId ? db.doc(`teams/${n.teamId}/members/${uid}`).get() : undefined,
  ]);
  if (!user.exists) return;
  if (member && (!member.exists || (member.data() as MemberDoc).status !== 'active')) return;
  const u = user.data() as UserDoc;
  if (u.notify?.[n.kind] === false && !MANDATORY_KINDS.includes(n.kind)) return;

  const { title, body } = notifyText(n.kind, (u.lang ?? 'en') as Lang, n.vars);
  await db.collection(`users/${uid}/notifications`).add({
    kind: n.kind,
    ...(n.teamId ? { teamId: n.teamId } : {}),
    ...(n.refId ? { refId: n.refId } : {}),
    title, body, url: n.url, read: false, createdAt: FieldValue.serverTimestamp(),
  });
  await pushAll(uid, JSON.stringify({ title, body, url: n.url, tag: n.refId ?? n.kind, kind: n.kind }));
}

/**
 * In-app notification (always) plus Web Push to each of the person's devices, in their own language.
 * Skips `opts.exclude`, people who are not active members of `n.teamId`, and opted-out non-mandatory kinds.
 */
export async function notifyUsers(uids: string[], n: Notification, opts?: { exclude?: string }): Promise<void> {
  const targets = [...new Set(uids)].filter((u) => u && u !== opts?.exclude);
  const results = await Promise.allSettled(targets.map((uid) => notifyOne(uid, n)));
  for (const r of results) if (r.status === 'rejected') console.error('notify failed', n.kind, r.reason);
}
