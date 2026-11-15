import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getPushConfig } from '../api';

export type PushState = 'unsupported' | 'needs-home-screen' | 'denied' | 'off' | 'on';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  (navigator as { standalone?: boolean }).standalone === true || !!globalThis.matchMedia?.('(display-mode: standalone)').matches;

/** Synchronous device capability. Never 'on': whether this user is subscribed needs pushActive / resolvePushState. */
export function pushState(): PushState {
  // iOS only exposes push to web apps added to the Home Screen.
  if (isIos() && !isStandalone()) return 'needs-home-screen';
  if (!('serviceWorker' in navigator) || typeof PushManager === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'off';
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

let keyPromise: Promise<string> | null = null;
/** The server's VAPID public key (from getPushConfig), fetched once per page load; a failed fetch is retried next time. */
function serverKey(): Promise<string> {
  keyPromise ??= getPushConfig().then((r) => {
    const k = (r?.vapidPublicKey ?? '').trim();
    if (!k) throw new Error('no-vapid-key');
    return k;
  }).catch((e) => { keyPromise = null; throw e; });
  return keyPromise;
}
/** Tests only: forget the cached key. */
export const _resetPushKey = () => { keyPromise = null; };

/** False only when the subscription states a key and it differs from `key` (some browsers do not expose it). */
function sameKey(sub: PushSubscription, key: string): boolean {
  const k = sub.options?.applicationServerKey;
  if (!k) return true;
  const a = new Uint8Array(k);
  const b = keyBytes(key);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

const regDoc = async (uid: string, endpoint: string) => doc(db, 'users', uid, 'pushSubs', await subId(endpoint));

/** True when this browser has a live subscription made with the server's key AND it is registered for this user. */
export async function pushActive(uid: string): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    if (!sameKey(sub, await serverKey())) return false;
    return (await getDoc(await regDoc(uid, sub.endpoint))).exists();
  } catch { return false; }
}

/** pushState plus the live check: 'on' only for a subscription registered under this user. */
export async function resolvePushState(uid: string): Promise<PushState> {
  const s = pushState();
  if (s !== 'off') return s;
  return (await pushActive(uid)) ? 'on' : 'off';
}

/** Only same-origin paths ("/x", not "//host"). */
export const isLocalPath = (u: unknown): u is string => typeof u === 'string' && u.startsWith('/') && !u.startsWith('//');

/** Subscribe with the server key and register the subscription for this user; undo the subscribe if registering fails. */
async function subscribeAndRegister(uid: string, reg: ServiceWorkerRegistration, key: string): Promise<void> {
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  const json = sub.toJSON();
  try {
    await setDoc(await regDoc(uid, sub.endpoint), {
      endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      ua: navigator.userAgent, createdAt: serverTimestamp(),
    });
  } catch (e) {
    await sub.unsubscribe().catch(() => {});
    throw e;
  }
}

/** Unsubscribe a stale subscription; its registration (if any) is removed without waiting (the server also drops it on 410). */
async function dropSubscription(uid: string, sub: PushSubscription): Promise<void> {
  void deleteDoc(await regDoc(uid, sub.endpoint)).catch(() => {});
  await sub.unsubscribe();
}

/** Ask permission, subscribe and register this device's subscription. Rejects if permission is refused. */
export async function enablePush(uid: string): Promise<void> {
  setPushOptOut(uid, false);
  if (await Notification.requestPermission() !== 'granted') throw new Error('permission-denied');
  const key = await serverKey();
  const reg = await navigator.serviceWorker.ready;
  // A subscription made with another key would make subscribe() fail (or keep the old, rejected key): drop it first.
  const existing = await reg.pushManager.getSubscription?.();
  if (existing && !sameKey(existing, key)) await dropSubscription(uid, existing);
  await subscribeAndRegister(uid, reg, key);
}

/**
 * App start, permission already granted: if this browser holds a subscription that was made with another key,
 * or whose registration is gone (e.g. removed by the server after a 404/410), subscribe afresh and register it.
 * A browser with no subscription is left alone (push was never turned on here, or was turned off). Never throws.
 */
export async function repairPush(uid: string): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (pushState() !== 'off') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const key = await serverKey();
    // Permission already granted but no subscription (e.g. signed out and back in): turn push back on for
    // this user, unless they switched it off themselves in Settings.
    if (!sub) { if (!optedOut(uid)) await subscribeAndRegister(uid, reg, key); return; }
    if (sameKey(sub, key) && (await getDoc(await regDoc(uid, sub.endpoint))).exists()) return;
    await dropSubscription(uid, sub);
    await subscribeAndRegister(uid, reg, key);
  } catch (e) {
    console.warn('push repair failed', e);
  }
}

/**
 * Remove this device's registration and unsubscribe it. The unsubscribe does not wait for the delete:
 * offline, a Firestore delete stays queued until this user is online and signed in again, while a dead endpoint makes the
 * server's next push fail with 410 and remove the registration itself.
 */
const OPT_OUT = (uid: string) => `pushOptOut:${uid}`;
function optedOut(uid: string): boolean {
  try { return localStorage.getItem(OPT_OUT(uid)) === '1'; } catch { return false; }
}
/** Remember (on this device) that this user switched push off themselves, so repairPush won't turn it back on. */
export function setPushOptOut(uid: string, out: boolean): void {
  try { if (out) localStorage.setItem(OPT_OUT(uid), '1'); else localStorage.removeItem(OPT_OUT(uid)); } catch { /* storage blocked */ }
}

export async function disablePush(uid: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const removed = deleteDoc(doc(db, 'users', uid, 'pushSubs', await subId(sub.endpoint)));
  try { await sub.unsubscribe(); } finally { await removed; }
}
