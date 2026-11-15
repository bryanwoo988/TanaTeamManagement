import type { Lang } from '../../shared/types';
import { useT } from './index';
import { useChooseLang } from './useChooseLang';

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: 'zh', label: '华语' },
  { lang: 'en', label: 'English' },
  { lang: 'ms', label: 'Melayu' },
];

export default function LanguagePicker() {
  const { t, lang } = useT();
  const choose = useChooseLang();
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
