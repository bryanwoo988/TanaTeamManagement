import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { sendTestPush } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { useT, type MessageKey } from '../i18n';
import AsyncButton from '../ui/AsyncButton';
import { errorDetail, toast, toastError } from '../ui/toast';
import { MANDATORY_KINDS, type NotifyKind } from '../../shared/types';
import { disablePush, enablePush, pushState, resolvePushState, type PushState } from './push';

const KINDS: NotifyKind[] = ['digest', 'assigned', 'changed', 'companyInvoice', 'claimSubmitted', 'claimDone', 'joinRequest', 'joined'];

export default function NotifySettings() {
  const { t } = useT();
  const { user, profile } = useAuth();
  const uid = user?.uid ?? '';
  const [state, setState] = useState<PushState>(pushState);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    resolvePushState(uid).then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [uid]);
  const userRef = () => doc(db, 'users', uid);
  const save = (data: Record<string, unknown>) => updateDoc(userRef(), data).catch(() => toastError());

  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function sendTest() {
    setTestMsg(null);
    try {
      const { results } = await sendTestPush();
      const sent = results.filter((r) => r.ok).length;
      if (sent > 0) setTestMsg({ ok: true, text: t('notify.testOk', { n: sent }) });
      else if (results.length === 0) setTestMsg({ ok: false, text: t('notify.testNone') });
      else {
        const codes = [...new Set(results.map((r) => (r.statusCode ? String(r.statusCode) : (r.message || '?').slice(0, 80))))].join(', ');
        setTestMsg({ ok: false, text: t('notify.testFailed', { codes }) });
      }
    } catch (e) { toast({ kind: 'err', title: t('notify.testError'), body: errorDetail(e) }); throw e; }
  }

  async function togglePush() {
    try {
      if (state === 'on') await disablePush(uid); else await enablePush(uid);
    } catch (e) { toast({ kind: 'err', title: t('notify.pushFailed'), body: errorDetail(e) }); throw e; } finally { setState(await resolvePushState(uid)); }
  }

  return (
    <section className="card stack" aria-label={t('notify.settings')}>
      <h2>{t('notify.settings')}</h2>
      {state === 'needs-home-screen' && <p>{t('notify.iphone')}</p>}
      {state === 'denied' && <p>{t('notify.denied')}</p>}
      {(state === 'on' || state === 'off') && (
        <AsyncButton className="btn block" onClick={togglePush}>{state === 'on' ? t('notify.pushOff') : t('notify.pushOn')}</AsyncButton>
      )}
      {(state === 'on' || state === 'off') && (
        <AsyncButton className="btn block" onClick={sendTest}>{t('notify.testSend')}</AsyncButton>
      )}
      {testMsg && <p role="status" className={testMsg.ok ? 'small' : 'small err'}>{testMsg.text}</p>}
      <ul className="plain-list">
        {KINDS.map((k) => {
          const locked = MANDATORY_KINDS.includes(k);
          const on = locked || profile?.notify?.[k] !== false;
          return (
            <li key={k}>
              <label className="row">
                <input type="checkbox" checked={on} disabled={locked} onChange={(e) => save({ [`notify.${k}`]: e.target.checked })} />
                <span>{t(`notify.kind.${k}` as MessageKey)}</span>
                {locked && <span className="small muted">{t('notify.required')}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <label className="field">
        <span>{t('notify.digestTime')}</span>
        <input type="time" value={profile?.digestTime ?? '20:00'} onChange={(e) => { if (/^\d{2}:\d{2}$/.test(e.target.value)) save({ digestTime: e.target.value }); }} />
      </label>
    </section>
  );
}
