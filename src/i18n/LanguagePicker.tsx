import { doc, updateDoc } from 'firebase/firestore';
import type { Lang } from '../../shared/types';
import { useAuth } from '../auth/AuthProvider';
import { db } from '../firebase';
import { toastError } from '../ui/toast';
import { useT } from './index';

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: 'zh', label: '华语' },
  { lang: 'en', label: 'English' },
  { lang: 'ms', label: 'Melayu' },
];

export default function LanguagePicker() {
  const { t, lang, setLang } = useT();
  const { user, profile } = useAuth();
  const choose = (l: Lang) => {
    setLang(l);
    // The server writes pushes and in-app notices in the profile's language (spec §6.7).
    if (user && profile && profile.lang !== l) updateDoc(doc(db, 'users', user.uid), { lang: l }).catch(() => toastError());
  };
  return (
    <div role="group" aria-label={t('settings.language')} className="lang-picker">
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          className={lang === o.lang ? 'btn primary' : 'btn'}
          aria-pressed={lang === o.lang}
          onClick={() => choose(o.lang)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
