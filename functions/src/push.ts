import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, REGION } from './lib/admin';
import { requireAuth } from './lib/auth';
import { NOTIFY_SECRETS, pushAll, vapidPublicKey, type PushResult } from './notify';
import { testPushText } from '../../shared/notifyText';
import type { Lang } from '../../shared/types';

const CALLABLE = { region: REGION, invoker: 'public' as const, secrets: NOTIFY_SECRETS };

/**
 * The VAPID public key the server signs with. Clients subscribe with this key, so the web build
 * can never carry a key that differs from the server's private key.
 */
export const getPushConfig = onCall(CALLABLE, async (request) => {
  requireAuth(request);
  const key = vapidPublicKey();
  if (!key) throw new HttpsError('failed-precondition', 'push.notConfigured');
  return { vapidPublicKey: key };
});

/** Sends a test push to the caller's own devices and reports each result. Writes no notification doc. */
export const sendTestPush = onCall(CALLABLE, async (request): Promise<{ results: PushResult[] }> => {
  const uid = requireAuth(request);
  const lang = ((await db.doc(`users/${uid}`).get()).get('lang') ?? 'en') as Lang;
  const { title, body } = testPushText(lang);
  const results = await pushAll(uid, JSON.stringify({ title, body, url: '/settings', tag: 'test', kind: 'test' }));
  return { results };
});
