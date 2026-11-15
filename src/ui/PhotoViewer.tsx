import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n';

/** Full-screen photo view. Tap anywhere, the close button or Escape to close; pinch-zoom works as on any page. */
export default function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const { t } = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <button type="button" className="photo-viewer-close" aria-label={t('common.close')} onClick={onClose}><X size={26} aria-hidden /></button>
      <img src={src} alt={alt} />
    </div>
  );
}
