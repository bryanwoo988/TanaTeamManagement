import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useT } from '../i18n';

/**
 * "Back" that returns to the page you came from (calendar, invoices, settings…). When the page was opened
 * directly (no in-app history, e.g. from a shared link) it goes to `fallback` instead.
 */
export default function BackLink({ fallback = '/' }: { fallback?: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  const onClick = (e: MouseEvent) => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) { e.preventDefault(); navigate(-1); }
  };
  return <p><Link to={fallback} onClick={onClick}>{t('back')}</Link></p>;
}
