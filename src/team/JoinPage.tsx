import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { joinTeam } from '../api';
import { useT } from '../i18n';
import { authErrorKey } from '../auth/authErrors';
import { errorDetail, toast } from '../ui/toast';
import { normalizeInviteCode } from '../../shared/inviteCode';
import { useTeams } from './TeamContext';

export const PENDING_JOIN_KEY = 'pendingJoin';

export function clearPendingJoin() {
  try { sessionStorage.removeItem(PENDING_JOIN_KEY); } catch { /* ignore */ }
}

/** /join/:code — requests to join the team behind a shared invite link. */
export default function JoinPage() {
  const { code: raw = '' } = useParams();
  const { t } = useT();
  const nav = useNavigate();
  const { setCurrent } = useTeams();
  const [state, setState] = useState<'sending' | 'pending' | 'bad' | 'error'>('sending');
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === attempt) return; // once per attempt (StrictMode runs effects twice)
    started.current = attempt;
    const code = normalizeInviteCode(raw);
    if (!code) { clearPendingJoin(); setState('bad'); return; }
    setState('sending');
    joinTeam(code).then((r) => {
      clearPendingJoin();
      if (r.status === 'active') { setCurrent(r.teamId); nav('/', { replace: true }); }
      else setState('pending');
    }).catch((e) => {
      if (authErrorKey(e) === 'team.badCode') { clearPendingJoin(); setState('bad'); return; }
      toast({ kind: 'err', title: t('ui.errorTitle'), body: errorDetail(e) || t('ui.errorBody') });
      setState('error');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, raw]);

  return (
    <main className="stack">
      <section className="card">
        {state === 'sending' && <p className="muted" aria-busy="true">{t('join.sending')}</p>}
        {state === 'pending' && (
          <>
            <h2>{t('join.pendingTitle')}</h2>
            <p>{t('join.pendingBody')}</p>
            <Link to="/" className="btn primary block">{t('join.toCalendar')}</Link>
          </>
        )}
        {state === 'bad' && (
          <>
            <p className="err" role="alert">{t('join.badLink')}</p>
            <Link to="/" className="btn primary block">{t('join.home')}</Link>
          </>
        )}
        {state === 'error' && (
          <>
            <p className="err" role="alert">{t('common.error')}</p>
            <button type="button" className="btn primary block" onClick={() => setAttempt((n) => n + 1)}>{t('common.retry')}</button>
          </>
        )}
      </section>
    </main>
  );
}
