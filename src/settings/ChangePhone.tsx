import { useState, type FormEvent } from 'react';
import { auth } from '../firebase';
import { confirmPhoneChange, requestPhoneChangeCode } from '../api';
import { useT, type MessageKey } from '../i18n';
import { toast } from '../ui/toast';
import { normalizeMyPhone } from '../../shared/phone';
import { authErrorKey, detailFor } from '../auth/authErrors';
import { formatMyPhone } from '../auth/LoginPage';
import PhoneInput, { serverPhone } from '../ui/PhoneInput';

/**
 * Change the signed-in user's phone in two steps: a code is texted to the new number, then the
 * server moves the account to it. `current` comes from the profile, which updates once the server
 * has written the new number.
 */
export default function ChangePhone({ current }: { current?: string }) {
  const { t } = useT();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function fail(e: unknown) {
    const key = authErrorKey(e);
    setError(key);
    setDetail(detailFor(key, e));
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDetail(null);
    const sp = serverPhone(phone);
    const p = sp ? normalizeMyPhone(sp) : null;
    if (!p?.ok) return setError('login.invalidPhone');
    if (p.e164 === current) return setError('phone.same');
    setBusy(true);
    try {
      await requestPhoneChangeCode(p.e164);
      setSentTo(p.e164);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    setError(null);
    setDetail(null);
    setBusy(true);
    try {
      await confirmPhoneChange(sentTo, code.trim());
      await auth.currentUser?.getIdToken(true).catch(() => {}); // pick up the new number in this session
      toast({ kind: 'ok', title: t('phone.doneTitle') });
      setSentTo(null);
      setPhone('');
      setCode('');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const errorBox = error && (
    <p className="err" role="alert">{t(error)}{detail && <small className="muted"> ({detail})</small>}</p>
  );
  const shown = current && normalizeMyPhone(current).ok ? formatMyPhone(current) : current;

  return (
    <section className="card stack" aria-label={t('phone.title')}>
      <h2>{t('phone.title')}</h2>
      {shown && <p className="muted">{t('phone.current', { phone: shown })}</p>}
      {!sentTo ? (
        <form onSubmit={send} noValidate className="stack">
          <label htmlFor="new-phone">{t('phone.new')}</label>
          <PhoneInput id="new-phone" value={phone} onChange={setPhone} />
          {errorBox}
          <button type="submit" className="btn block" disabled={busy}>{t('login.sendCode')}</button>
        </form>
      ) : (
        <form onSubmit={confirm} noValidate className="stack">
          <p>{t('login.codeSent', { phone: formatMyPhone(sentTo) })}</p>
          <label htmlFor="new-code">{t('login.code')}</label>
          <input id="new-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          {errorBox}
          <button type="submit" className="btn primary block" disabled={busy || code.length !== 6}>{t('phone.confirm')}</button>
          <button type="button" className="btn block" disabled={busy} onClick={() => { setSentTo(null); setCode(''); setError(null); setDetail(null); }}>{t('back')}</button>
        </form>
      )}
    </section>
  );
}
