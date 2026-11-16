import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useTeams } from '../team/TeamContext';
import { listEvents } from '../calendar/data';
import { isActive } from '../../shared/access';
import { klDate } from '../../shared/dates';
import { useT } from '../i18n';
import AsyncButton from '../ui/AsyncButton';
import { errorDetail, toast } from '../ui/toast';
import { enablePush, repairPush, resolvePushState, type PushState } from './push';

/** Nudges people who would benefit from push (team members, or anyone with an upcoming job) to turn it on. */
export default function PushBanner() {
  const { t } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const { teams } = useTeams();
  // null until the live check finishes: never flash the banner at people whose push is already on.
  const [state, setState] = useState<PushState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [assigned, setAssigned] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    // Mounted once signed in with a profile: first fix a stale registration (key changed, or removed by the server), silently.
    repairPush(uid).then(() => resolvePushState(uid)).then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [uid]);

  useEffect(() => {
    if (!uid || state === null || state === 'on') return;
    const now = new Date();
    const from = klDate(now);
    const to = klDate(new Date(now.getTime() + 60 * 86_400_000));
    return listEvents('personal', from, to, (l) => setAssigned(l.some((e) => e.assignees.includes(uid))), () => {});
  }, [uid, state]);

  const member = teams.some(isActive);
  if (!uid || state === null || state === 'on' || state === 'unsupported' || dismissed || !(member || assigned)) return null;

  async function enable() {
    try { await enablePush(uid); } catch (e) { toast({ kind: 'err', title: t('notify.pushFailed'), body: errorDetail(e) }); throw e; } finally { setState(await resolvePushState(uid)); }
  }
  // Session-only: the banner comes back on the next app open while push is not on.
  const dismiss = () => setDismissed(true);

  return (
    <section className="push-banner" role="region" aria-label={t('notify.bell')}>
      <BellRing size={18} className="push-banner-icon" aria-hidden />
      <span className="push-banner-text">
        {state === 'off' && t('notify.bannerTitle')}
        {state === 'needs-home-screen' && t('notify.iphone')}
        {state === 'denied' && t('notify.denied')}
      </span>
      {state === 'off' && <AsyncButton className="btn primary push-banner-btn" onClick={enable}>{t('notify.pushOn')}</AsyncButton>}
      <button type="button" className="icon-btn" aria-label={t('notify.dismiss')} title={t('notify.dismiss')} onClick={dismiss}><X size={18} aria-hidden /></button>
    </section>
  );
}
