import { useT } from '../i18n';
import { APP_VERSION, BUILD_TIME, CHANGELOG, COMMIT, formatKL } from './changelog';
import SubPage from './SubPage';

export default function AboutPage() {
  const { t, lang } = useT();
  const built = formatKL(BUILD_TIME);
  return (
    <SubPage title={t('settings.about')}>
      <section className="card stack">
        <p className="about-version">{t('settings.version', { version: APP_VERSION })}</p>
        <p className="muted">{t('settings.builtOn', { date: built })}</p>
        <p className="small muted">{t('settings.commit', { sha: COMMIT })}</p>
      </section>
      <section className="stack" aria-label={t('settings.whatsNew')}>
        <h2 className="group-title">{t('settings.whatsNew')}</h2>
        {CHANGELOG.map((c, i) => (
          <article key={c.version} className="card changelog-entry">
            <h3>v{c.version} <span className="muted small">{i === 0 ? built : c.date}</span></h3>
            <ul>{c.items[lang].map((it) => <li key={it}>{it}</li>)}</ul>
          </article>
        ))}
      </section>
    </SubPage>
  );
}
