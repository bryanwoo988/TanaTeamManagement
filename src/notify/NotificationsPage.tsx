import { Link, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n';
import AsyncButton from '../ui/AsyncButton';
import { toastError } from '../ui/toast';
import { markAllRead, markRead, useNotifications, type Notice } from './notifications';

function when(n: Notice): string {
  const d = n.createdAt?.toDate?.();
  return d ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
}

export default function NotificationsPage() {
  const { t } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const nav = useNavigate();
  const list = useNotifications(uid);
  const hasUnread = list.some((n) => !n.read);

  function open(n: Notice) {
    if (!n.read) markRead(uid, n.id).catch(() => toastError());
    if (n.url.startsWith('/')) nav(n.url);
  }

  async function all() {
    try { await markAllRead(uid, list); } catch (e) { toastError(); throw e; }
  }

  return (
    <>
      <header className="topbar">
        <Link to="/" className="btn" aria-label={t('back')}><ArrowLeft size={20} aria-hidden /></Link>
        <h1 className="grow">{t('notify.title')}</h1>
      </header>
      <main className="stack">
        {hasUnread && <AsyncButton className="btn block" onClick={all}>{t('notify.markAll')}</AsyncButton>}
        {list.length === 0 && <p className="muted">{t('notify.empty')}</p>}
        <ul className="plain-list notice-list">
          {list.map((n) => (
            <li key={n.id}>
              <button type="button" className={`card notice ${n.read ? '' : 'unread'}`} onClick={() => open(n)}>
                <strong>{n.title}</strong>
                <span>{n.body}</span>
                <span className="small muted">{when(n)}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
