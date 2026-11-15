import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { db, REGION } from './lib/admin';
import { NOTIFY_SECRETS, notifyUsers } from './notify';
import { addDays, klDate, klTime, minutesOf } from '../../shared/dates';
import { digestBody, digestDay, isDue } from '../../shared/digest';
import { notifyUrl } from '../../shared/notifyUrls';
import type { EventDoc, Lang, MemberDoc, UserDoc } from '../../shared/types';

const WINDOW = 15;

/** Every HH:MM in the window ending now: the digestTime values isDue can accept. */
function dueTimes(nowMin: number): string[] {
  return Array.from({ length: WINDOW }, (_, i) => {
    const m = (nowMin - i + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  });
}

/** Tomorrow's work for one person: team events they are assigned in teams where they are active, plus their personal events. */
async function workOn(uid: string, date: string): Promise<EventDoc[]> {
  const [team, personal] = await Promise.all([
    db.collectionGroup('events').where('assignees', 'array-contains', uid).where('date', '==', date).get(),
    db.collection(`users/${uid}/events`).where('date', '==', date).get(),
  ]);
  // The collection group also matches users/*/events; personal ones come from the direct query only.
  const teamDocs = team.docs.filter((d) => d.ref.parent.parent?.parent.id === 'teams');
  const teamIds = [...new Set(teamDocs.map((d) => d.ref.parent.parent!.id))];
  const members = await Promise.all(teamIds.map((t) => db.doc(`teams/${t}/members/${uid}`).get()));
  const active = new Set(teamIds.filter((_, i) => members[i].exists && (members[i].data() as MemberDoc).status === 'active'));
  const mine = (d: DocumentSnapshot) => d.data() as EventDoc;
  return [...teamDocs.filter((d) => active.has(d.ref.parent.parent!.id)).map(mine), ...personal.docs.map(mine)];
}

async function digestFor(uid: string, u: UserDoc, date: string): Promise<void> {
  if (u.notify?.digest === false) return;
  const events = await workOn(uid, date);
  if (!events.length) return;
  try {
    // One digest per person per day, even if two runs overlap or a run is retried.
    await db.doc(`digestSent/${uid}_${date}`).create({ expiresAt: new Date(`${addDays(date, 2)}T00:00:00+08:00`) });
  } catch (e: any) {
    if (e?.code === 6) return; // ALREADY_EXISTS
    throw e;
  }
  const lang = (u.lang ?? 'en') as Lang;
  await notifyUsers([uid], { kind: 'digest', id: `digest_${date}`, vars: { count: events.length, list: digestBody(events, lang) }, url: notifyUrl.calendar(undefined, date) });
}

/** Sends tomorrow's digest to everyone whose digestTime fell in the 15 minutes ending at `now` (KL time). */
export async function runDigest(now: Date): Promise<void> {
  const nowMin = minutesOf(klTime(now));
  const today = klDate(now);
  const users = await db.collection('users').where('digestTime', 'in', dueTimes(nowMin)).get();
  const results = await Promise.allSettled(users.docs.map((d) => {
    const u = d.data() as UserDoc;
    if (!isDue(u.digestTime, nowMin)) return;
    return digestFor(d.id, u, digestDay(u.digestTime, today, nowMin));
  }));
  for (const r of results) if (r.status === 'rejected') console.error('digest failed', r.reason);
}

export const tomorrowDigest = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Asia/Kuala_Lumpur', region: REGION, secrets: NOTIFY_SECRETS },
  // The scheduled slot, not the wall clock: a late or retried run still covers the same 15 minutes.
  async (ev) => runDigest(new Date(ev.scheduleTime)),
);
