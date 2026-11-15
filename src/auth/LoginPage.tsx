import { useEffect, useState, type FormEvent } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { CalendarDays, Receipt, Users } from 'lucide-react';
import { auth } from '../firebase';
import { requestLoginCode, verifyLoginCode } from '../api';
import { useT, type MessageKey } from '../i18n';
import InlineLangSwitch from '../i18n/InlineLangSwitch';
import { normalizeMyPhone } from '../../shared/phone';
import { authErrorKey, detailFor } from './authErrors';
import Logo from '../ui/Logo';
import PhoneInput, { serverPhone } from '../ui/PhoneInput';

const RESEND_SECONDS = 60;

/** +60123456789 → "+60 12-345 6789"; +601123456789 → "+60 11-2345 6789". */
export function formatMyPhone(e164: string): string {
  const l = e164.slice(3);
  const rest = l.slice(2);
  return `+60 ${l.slice(0, 2)}-${rest.length === 8 ? `${rest.slice(0, 4)} ${rest.slice(4)}` : `${rest.slice(0, 3)} ${rest.slice(3)}`}`;
}

export default function LoginPage() {
  const { t } = useT();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The number the code was sent to, as sent to the server; null until a code is sent.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  function fail(err: unknown) {
    const k = authErrorKey(err);
    setError(k);
    setDetail(detailFor(k, err));
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setDetail(null);
    const p = sentTo ?? serverPhone(phone);
    if (!p) {
      setError('login.invalidPhone');
      return;
    }
    setBusy(true);
    try {
      await requestLoginCode(p);
      setSentTo(p);
      setWait(RESEND_SECONDS);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    setError(null);
    setDetail(null);
    setBusy(true);
    try {
      const { token } = await verifyLoginCode(sentTo, code.trim());
      // AuthProvider sees the new user and the route gate takes over.
      await signInWithCustomToken(auth, token);
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }

  const errorBox = error && (
    <p className="err" role="alert">{t(error)}{detail && <small className="muted"> ({detail})</small>}</p>
  );
  const shown = sentTo ? normalizeMyPhone(sentTo) : null;

  return (
    <main className="login">
      <section className="login-hero">
        <Logo />
        <p className="login-welcome">{t('login.welcome')}</p>
        <h1 className="login-title">{t('appName')}</h1>
        <p className="muted">{t('login.intro')}</p>
        <ul className="login-features">
          <li><CalendarDays size={22} aria-hidden />{t('login.f1')}</li>
          <li><Receipt size={22} aria-hidden />{t('login.f2')}</li>
          <li><Users size={22} aria-hidden />{t('login.f3')}</li>
        </ul>
      </section>

      <section className="login-sheet">
        {!sentTo ? (
          <form onSubmit={sendCode} noValidate>
            <label htmlFor="phone" className="sr-only">{t('login.phone')}</label>
            <PhoneInput id="phone" value={phone} onChange={setPhone} />
            <p className="muted small">{t('login.phoneHint')}</p>
            {errorBox}
            <button type="submit" className="btn primary block" disabled={busy || phone.replace(/\D/g, '').length < 8}>
              {t('login.sendCode')}
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <h2 className="login-code-title">{t('login.codeTitle')}</h2>
            <p className="muted">{t('login.codeSent', { phone: shown?.ok ? formatMyPhone(shown.e164) : sentTo })}</p>
            <label htmlFor="code" className="sr-only">{t('login.code')}</label>
            <input id="code" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            {errorBox}
            <button type="submit" className="btn primary block" disabled={busy || code.length !== 6}>{t('login.verify')}</button>
            <div className="grid2">
              <button type="button" className="btn" disabled={busy || wait > 0} onClick={() => sendCode()}>
                {wait > 0 ? t('login.resendIn', { s: wait }) : t('login.resend')}
              </button>
              <button type="button" className="btn" onClick={() => { setSentTo(null); setCode(''); setError(null); setDetail(null); }}>
                {t('login.changePhone')}
              </button>
            </div>
          </form>
        )}
        <div className="login-lang"><InlineLangSwitch /></div>
      </section>
    </main>
  );
}
