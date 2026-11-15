import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type PushState = 'unsupported' | 'needs-home-screen' | 'denied' | 'off' | 'on';

const FLAG = 'pushOn';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  (navigator as { standalone?: boolean }).standalone === true || !!globalThis.matchMedia?.('(display-mode: standalone)').matches;

function flag(v?: boolean): boolean {
  try {
    if (v === true) localStorage.setItem(FLAG, '1');
    else if (v === false) localStorage.removeItem(FLAG);
    return localStorage.getItem(FLAG) === '1';
  } catch { return false; }
}

/** Whether this device can and does receive push. 'on' means permission granted and we subscribed from this browser. */
export function pushState(): PushState {
  if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) return 'unsupported';
  // iOS only exposes push to web apps added to the Home Screen.
  if (isIos() && !isStandalone()) return 'needs-home-screen';
  if (!('serviceWorker' in navigator) || typeof PushManager === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && flag() ? 'on' : 'off';
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

/** Ask permission, subscribe and register this device's subscription. Rejects if permission is refused. */
export async function enablePush(uid: string): Promise<void> {
  if (await Notification.requestPermission() !== 'granted') throw new Error('permission-denied');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(import.meta.env.VITE_VAPID_PUBLIC_KEY) });
  const json = sub.toJSON();
  await setDoc(doc(db, 'users', uid, 'pushSubs', await subId(sub.endpoint)), {
    endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    ua: navigator.userAgent, createdAt: serverTimestamp(),
  });
  flag(true);
}

/** Unsubscribe this device and remove its registration. */
export async function disablePush(uid: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  flag(false);
  if (!sub) return;
  await deleteDoc(doc(db, 'users', uid, 'pushSubs', await subId(sub.endpoint)));
  await sub.unsubscribe();
}
