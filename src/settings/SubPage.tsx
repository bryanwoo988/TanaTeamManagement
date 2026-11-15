import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { useT } from '../i18n';

/** Settings sub-page frame: back link to /settings plus the page title. */
export default function SubPage({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useT();
  return (
    <main className="stack">
      <Link className="back-link" to="/settings"><ChevronLeft size={20} aria-hidden /><span>{t('settings.back')}</span></Link>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
