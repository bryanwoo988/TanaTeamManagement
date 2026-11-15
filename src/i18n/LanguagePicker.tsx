import type { Lang } from '../../shared/types';
import { useT } from './index';

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: 'zh', label: '华语' },
  { lang: 'en', label: 'English' },
  { lang: 'ms', label: 'Melayu' },
];

export default function LanguagePicker() {
  const { lang, setLang } = useT();
  return (
    <div role="group" aria-label="Language" className="lang-picker">
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          className={lang === o.lang ? 'btn primary' : 'btn'}
          aria-pressed={lang === o.lang}
          onClick={() => setLang(o.lang)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
