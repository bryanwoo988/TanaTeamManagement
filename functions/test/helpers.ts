import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const PROJECT = 'demo-tana';
const BASE = `http://127.0.0.1:5001/${PROJECT}/asia-southeast1`;

if (!getApps().length) initializeApp({ projectId: PROJECT });
export const db = getFirestore();

function b64url(obj: object) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** Unsigned ID token; the Functions emulator accepts these when the Auth emulator is running. */
export function fakeIdToken(uid: string, phone?: string) {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: 'none', typ: 'JWT' }),
    b64url({
      iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, auth_time: now, iat: now, exp: now + 3600,
      sub: uid, user_id: uid, phone_number: phone,
      firebase: { identities: phone ? { phone: [phone] } : {}, sign_in_provider: 'phone' },
    }),
    '',
  ].join('.');
}

/** Calls a callable; resolves with `result`, rejects with an Error whose message is the HttpsError message. */
export async function call<T = any>(name: string, data: unknown, auth?: { uid: string; phone?: string }): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${fakeIdToken(auth.uid, auth.phone)}`;
  const res = await fetch(`${BASE}/${name}`, { method: 'POST', headers, body: JSON.stringify({ data }) });
  const body = (await res.json()) as any;
  if (body.error) throw Object.assign(new Error(body.error.message), { status: body.error.status });
  return body.result as T;
}

export async function clearDb() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

export async function clearAuth() {
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
}
