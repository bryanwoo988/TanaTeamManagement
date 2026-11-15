import type { MessageKey } from '../i18n';

const KNOWN: MessageKey[] = [
  'login.invalidPhone', 'login.wrongCode', 'login.codeExpired', 'login.tooMany', 'login.blocked', 'login.sendFailed',
  'phone.same', 'phone.inUse', 'profile.missing',
  'team.adminOnly', 'team.badCode', 'team.badRole', 'team.badTeam', 'team.codeCollision', 'team.lastAdmin', 'team.noCode',
];

/** The server names its reason as a message key (e.g. 'login.tooMany'); the SDK appends " [429]". */
export function errorKey(e: unknown): string | null {
  const m = (e as { message?: string })?.message?.replace(/\s*\[\d{3}\]$/, '');
  return m && /^[a-z]+\.[A-Za-z]+$/.test(m) ? m : null;
}

/** Translatable message key for a failed callable; anything unknown becomes the generic error. */
export function authErrorKey(e: unknown): MessageKey {
  const k = errorKey(e) as MessageKey | null;
  return k && KNOWN.includes(k) ? k : 'common.error';
}

/** Code to show next to a generic message so problems can be diagnosed from a screenshot. */
export function detailFor(key: MessageKey, e: unknown): string | null {
  const twilio = (e as { details?: { twilio?: unknown } })?.details?.twilio;
  if (twilio) return `Twilio ${twilio}`;
  const code = (e as { code?: string })?.code || (e as { message?: string })?.message || '';
  return key === 'common.error' && code ? String(code) : null;
}
