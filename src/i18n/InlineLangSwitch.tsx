import { Fragment } from 'react';
import type { Lang } from '../../shared/types';
import { useT } from './index';
import { useChooseLang } from './useChooseLang';

const NAMES: Record<Lang, string> = { en: 'English', zh: '中文', ms: 'Melayu' };
const ORDER: Lang[] = ['en', 'zh', 'ms'];

/** "Switch language? 中文 · Melayu": the other two languages as text links. */
export default function InlineLangSwitch() {
  const { t, lang } = useT();
  const choose = useChooseLang();
  return (
    <p className="lang-switch">
      <span>{t('login.switchLang')}</span>
      {ORDER.filter((l) => l !== lang).map((l, i) => (
        <Fragment key={l}>
          {i > 0 && <span aria-hidden> · </span>}
          <button type="button" className="lang-link" lang={l === 'zh' ? 'zh-Hans' : l} onClick={() => choose(l)}>{NAMES[l]}</button>
        </Fragment>
      ))}
    </p>
  );
}
