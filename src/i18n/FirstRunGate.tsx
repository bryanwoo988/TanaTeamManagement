import { useEffect, type ReactNode } from 'react';
import { Languages } from 'lucide-react';
import type { Lang } from '../../shared/types';
import { useAuth } from '../auth/AuthProvider';
import { setLang, hasChosenLang, useLangChosen } from './index';

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: 'en', label: 'English' },
  { lang: 'zh', label: '中文' },
  { lang: 'ms', label: 'Bahasa Melayu' },
];

/** First visit: ask for a language before the login page. A signed-in profile counts as chosen. */
export default function FirstRunGate({ children }: { children: ReactNode }) {
  const chosen = useLangChosen();
  const { user, profile, loading } = useAuth();
  const profileLang = profile?.lang;
  useEffect(() => {
    if (profileLang && !hasChosenLang()) setLang(profileLang);
  }, [profileLang]);
  if (chosen || loading || user) return <>{children}</>;
  return (
    <main className="first-run">
      <img className="login-logo" src="/icons/icon-192.png" alt="" width={72} height={72} />
      <Languages size={22} aria-hidden />
      <h1>Choose your language</h1>
      <p className="first-run-sub" lang="zh-Hans">选择语言 / Pilih bahasa</p>
      <div className="first-run-options">
        {OPTIONS.map((o) => (
          <button key={o.lang} type="button" className="btn primary" lang={o.lang === 'zh' ? 'zh-Hans' : o.lang} onClick={() => setLang(o.lang)}>{o.label}</button>
        ))}
      </div>
    </main>
  );
}
