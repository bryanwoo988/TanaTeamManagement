import { useState, type FormEvent } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useT } from '../i18n';
import { signOut } from './AuthProvider';

export default function ProfileSetup() {
  const { t, lang } = useT();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const me = auth.currentUser;
    if (!name.trim() || !me?.phoneNumber) return;
    setBusy(true);
    setErr(false);
    try {
      // The rules accept exactly these fields; the snapshot listener in AuthProvider then moves us on.
      await setDoc(doc(db, 'users', me.uid), {
        name: name.trim(),
        phone: me.phoneNumber,
        lang,
        notify: {},
        digestTime: '20:00',
        createdAt: serverTimestamp(),
      });
    } catch {
      setErr(true);
      setBusy(false);
    }
  }

  return (
    <main className="profile-setup">
      <form className="card" onSubmit={submit}>
        <h1>{t('profile.welcome')}</h1>
        <p className="muted">{t('profile.nameHint')}</p>
        <label htmlFor="name">{t('profile.name')}</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
        {err && <p className="err" role="alert">{t('common.error')}</p>}
        <button type="submit" className="btn primary block" style={{ marginTop: 16 }} disabled={busy || !name.trim()}>
          {t('common.continue')}
        </button>
        <button type="button" className="btn block" style={{ marginTop: 8 }} onClick={() => signOut()}>
          {t('common.signOut')}
        </button>
      </form>
    </main>
  );
}
