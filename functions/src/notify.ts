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
  /** Deterministic doc id (e.g. `${event.id}_${kind}`): a repeated trigger delivery then writes and pushes nothing new. */
  id?: string;
}

/** Delivers one push message; on failure throws an error carrying the push service's HTTP `statusCode`. */
export type PushSender = (sub: PushSubDoc, payload: string, uid: string) => Promise<void>;

let vapidReady = false;
const webPushSender: PushSender = async (sub, payload) => {
  if (!vapidReady) {
    webpush.setVapidDetails(VAPID_SUBJECT.value().trim(), VAPID_PUBLIC_KEY.value().trim(), VAPID_PRIVATE_KEY.value().trim());
    vapidReady = true;
  }
  await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 24 * 3600 });
};

/** Local emulator only: never contacts a push service. Endpoints containing '/gone' or '/notfound' act expired. */
const emulatorSender: PushSender = async (sub, payload, uid) => {
  if (sub.endpoint.includes('/gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
  if (sub.endpoint.includes('/notfound')) throw Object.assign(new Error('not found'), { statusCode: 404 });
  await db.collection('_pushLog').add({ uid, endpoint: sub.endpoint, payload });
};

const sendPush: PushSender = IS_EMULATOR ? emulatorSender : webPushSender;

/** Outcome of one device's push. `host` is the push service's hostname only, never the full endpoint. */
export interface PushResult { host: string; ok: boolean; statusCode?: number; message?: string }

function hostOf(endpoint: string): string {
  try { return new URL(endpoint).hostname; } catch { return ''; }
}

/** Pushes `payload` to every registered device of `uid`; expired (404/410) registrations are deleted. */
export async function pushAll(uid: string, payload: string): Promise<PushResult[]> {
  const subs = await db.collection(`users/${uid}/pushSubs`).get();
  return Promise.all(subs.docs.map(async (s): Promise<PushResult> => {
    const sub = s.data() as PushSubDoc;
    const host = hostOf(sub.endpoint);
    try {
      await sendPush(sub, payload, uid);
      return { host, ok: true };
    } catch (e: any) {
      const statusCode = typeof e?.statusCode === 'number' ? e.statusCode : undefined;
      if (statusCode === 404 || statusCode === 410) await s.ref.delete();
      else console.error('push failed', uid, s.id, statusCode, e?.message);
      return { host, ok: false, ...(statusCode !== undefined ? { statusCode } : {}), message: String(e?.message ?? e).slice(0, 200) };
    }
  }));
}

/** Emulator only: a fixed demo public key (its private half is never used, the emulator sender contacts no push service). */
const EMULATOR_VAPID_PUBLIC_KEY = 'BJS3kMddDyD0GdJMmCGKxd-Wi58pWVtM8eShjtreEBzG0gY9u2bwZi09RJxxAe-Sgm-jw9cSuaOUSrjkUtg9Ff4';

/** The VAPID public key the server signs pushes with: the single source of truth for clients. Needs NOTIFY_SECRETS. */
export function vapidPublicKey(): string {
  const key = VAPID_PUBLIC_KEY.value().trim();
  return key || (IS_EMULATOR ? EMULATOR_VAPID_PUBLIC_KEY : '');
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
  const doc = {
    kind: n.kind,
    ...(n.teamId ? { teamId: n.teamId } : {}),
    ...(n.refId ? { refId: n.refId } : {}),
    title, body, url: n.url, read: false, createdAt: FieldValue.serverTimestamp(),
  };
  const notes = db.collection(`users/${uid}/notifications`);
  if (!n.id) await notes.add(doc);
  else {
    try {
      await notes.doc(n.id).create(doc);
    } catch (e: any) {
      if (e?.code === 6) return; // ALREADY_EXISTS: duplicate delivery, already written and pushed.
      throw e;
    }
  }
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
