import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import AsyncButton from '../ui/AsyncButton';
import { toast, toastError } from '../ui/toast';
import { useT } from '../i18n';
import ChangePhone from './ChangePhone';
import SubPage from './SubPage';

/** Edit the display name; the backend copies it to every team membership. */
export function ChangeName() {
  const { t } = useT();
  const { user, profile } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const clean = name.trim();
  async function save() {
    if (!user || !clean) return;
    try { await updateDoc(doc(db, 'users', user.uid), { name: clean }); } catch (e) { toastError(); throw e; }
    toast({ kind: 'ok', title: t('account.nameSaved') });
  }
  return (
    <section className="card stack">
      <h2>{t('account.nameTitle')}</h2>
      <label>{t('profile.name')}<input value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} /></label>
      <p className="muted small">{t('account.nameHint')}</p>
      <AsyncButton onClick={save} disabled={!clean || clean === (profile?.name ?? '')}>{t('save')}</AsyncButton>
    </section>
  );
}

export default function AccountPage() {
  const { t } = useT();
  const { profile } = useAuth();
  return (
    <SubPage title={t('settings.accountTitle')}>
      <ChangeName />
      <ChangePhone current={profile?.phone} />
    </SubPage>
  );
}
