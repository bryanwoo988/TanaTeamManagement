import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useT } from '../i18n';
import { toast } from '../ui/toast';
import SubPage from './SubPage';

export const APP_URL = 'https://tana-team.web.app';

export default function SharePage() {
  const { t } = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) QRCode.toCanvas(canvas.current, APP_URL, { width: 224, margin: 1, color: { dark: '#000000', light: '#ffffff' } }).catch(() => {});
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(APP_URL);
      toast({ kind: 'ok', title: t('share.copied') });
    } catch {
      toast({ kind: 'err', title: t('common.error') });
    }
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const share = () => navigator.share({ title: 'Tana Team', text: t('share.text'), url: APP_URL }).catch(() => {});

  return (
    <SubPage title={t('settings.share')}>
      <section className="card stack share-card">
        <div className="qr-tile"><canvas ref={canvas} role="img" aria-label={t('share.qrLabel')} /></div>
        <p className="muted">{t('share.hint')}</p>
        <p className="share-url">{APP_URL}</p>
        <div className="share-actions">
          <button type="button" className="btn" onClick={copy}>{t('share.copy')}</button>
          {canShare && <button type="button" className="btn primary" onClick={share}>{t('share.share')}</button>}
        </div>
      </section>
    </SubPage>
  );
}
