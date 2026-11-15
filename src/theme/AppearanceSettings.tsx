import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import { useAppearance, type Mode } from './appearance';
import { DARK_IDS, LIGHT_IDS, THEMES, type ThemeId } from './themes';

const MODES: { mode: Mode; key: MessageKey }[] = [
  { mode: 'system', key: 'appearanceModeSystem' },
  { mode: 'light', key: 'appearanceModeLight' },
  { mode: 'dark', key: 'appearanceModeDark' },
];

function Swatches({ ids, value, onPick }: { ids: ThemeId[]; value: ThemeId; onPick: (id: ThemeId) => void }) {
  return (
    <div className="swatches">
      {ids.map((id) => {
        const th = THEMES[id];
        return (
          <button
            key={id}
            type="button"
            className="swatch"
            aria-pressed={value === id}
            onClick={() => onPick(id)}
          >
            <span className="swatch-preview" style={{ background: th.bg, borderColor: th.line }} aria-hidden="true">
              <span className="swatch-card" style={{ background: th.card }}>
                <span className="swatch-bar swatch-accent" style={{ background: th.accent }} />
                <span className="swatch-bar" style={{ background: th.kind === 'light' ? '#c9c9c9' : '#4a4a4f' }} />
              </span>
            </span>
            <span className="swatch-label">{th.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function AppearanceSettings() {
  const { t } = useT();
  const a = useAppearance();
  return (
    <section className="appearance">
      <h2 className="appearance-title">{t('appearanceTitle')}</h2>
      <div className="card">
        <div className="segmented" role="group" aria-label={t('appearanceTitle')}>
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              aria-pressed={a.mode === m.mode}
              onClick={() => a.set({ mode: m.mode })}
            >
              {t(m.key)}
            </button>
          ))}
        </div>
        <p className="muted appearance-help">{t('appearanceHelp')}</p>
        <h3 className="appearance-sub">{t('appearanceLight')}</h3>
        <Swatches ids={LIGHT_IDS} value={a.light} onPick={(light) => a.set({ light })} />
        <h3 className="appearance-sub">{t('appearanceDark')}</h3>
        <Swatches ids={DARK_IDS} value={a.dark} onPick={(dark) => a.set({ dark })} />
      </div>
    </section>
  );
}
