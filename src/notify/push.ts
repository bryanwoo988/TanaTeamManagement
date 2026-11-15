import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type PushState = 'unsupported' | 'needs-home-screen' | 'denied' | 'off' | 'on';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  (navigator as { standalone?: boolean }).standalone === true || !!globalThis.matchMedia?.('(display-mode: standalone)').matches;

/** Synchronous device capability. Never 'on': whether this user is subscribed needs pushActive / resolvePushState. */
export function pushState(): PushState {
  if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) return 'unsupported';
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

/** True when this browser has a live subscription AND it is registered for this user. */
export async function pushActive(uid: string): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    return (await getDoc(doc(db, 'users', uid, 'pushSubs', await subId(sub.endpoint)))).exists();
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

/** Ask permission, subscribe and register this device's subscription. Rejects if permission is refused. */
export async function enablePush(uid: string): Promise<void> {
  if (await Notification.requestPermission() !== 'granted') throw new Error('permission-denied');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(import.meta.env.VITE_VAPID_PUBLIC_KEY) });
  const json = sub.toJSON();
  try {
    await setDoc(doc(db, 'users', uid, 'pushSubs', await subId(sub.endpoint)), {
      endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      ua: navigator.userAgent, createdAt: serverTimestamp(),
    });
  } catch (e) {
    await sub.unsubscribe().catch(() => {});
    throw e;
  }
}

/**
 * Remove this device's registration and unsubscribe it. The unsubscribe does not wait for the delete:
 * offline, a Firestore delete stays queued until this user is online and signed in again, while a dead endpoint makes the
 * server's next push fail with 410 and remove the registration itself.
 */
export async function disablePush(uid: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const removed = deleteDoc(doc(db, 'users', uid, 'pushSubs', await subId(sub.endpoint)));
  try { await sub.unsubscribe(); } finally { await removed; }
}
