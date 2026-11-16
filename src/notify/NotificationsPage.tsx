import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Bell, BellOff, CalendarClock, CalendarPlus, CheckCheck, ClipboardList, Receipt, ReceiptText, UserCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n';
import AsyncButton from '../ui/AsyncButton';
import { toastError } from '../ui/toast';
import { addDays, klDate } from '../../shared/dates';
import type { NotifyKind } from '../../shared/types';
import { isLocalPath } from './push';
import { markAllRead, markRead, useNotifications, type Notice } from './notifications';

const LOCALE = { zh: 'zh-CN', en: 'en-MY', ms: 'ms-MY' } as const;
const KL = 'Asia/Kuala_Lumpur';

const ICONS: Record<NotifyKind, ReactNode> = {
  digest: <ClipboardList size={20} />,
  assigned: <CalendarPlus size={20} />,
  changed: <CalendarClock size={20} />,
  companyInvoice: <ReceiptText size={20} />,
  claimSubmitted: <Receipt size={20} />,
  claimDone: <Receipt size={20} />,
  joinRequest: <UserPlus size={20} />,
  joined: <UserCheck size={20} />,
};

type Bucket = 'today' | 'yesterday' | 'earlier';

export default function NotificationsPage() {
  const { t, lang } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const nav = useNavigate();
  const list = useNotifications(uid);
  const unread = list.filter((n) => !n.read).length;
  const today = klDate(new Date());
  const yesterday = addDays(today, -1);

  function open(n: Notice) {
    if (!n.read) markRead(uid, n.id).catch(() => toastError());
    if (isLocalPath(n.url)) nav(n.url);
  }

  async function all() {
    try { await markAllRead(uid, list); } catch (e) { toastError(); throw e; }
  }

  const bucketOf = (n: Notice): Bucket => {
    const d = n.createdAt?.toDate?.();
    const day = d ? klDate(d) : today;
    return day >= today ? 'today' : day === yesterday ? 'yesterday' : 'earlier';
  };
  /** Today/yesterday: the time; earlier: the date. */
  const when = (n: Notice, b: Bucket): string => {
    const d = n.createdAt?.toDate?.();
    if (!d) return '';
    return b === 'earlier'
      ? d.toLocaleDateString(LOCALE[lang], { timeZone: KL, month: 'short', day: 'numeric' })
      : d.toLocaleTimeString(LOCALE[lang], { timeZone: KL, hour: '2-digit', minute: '2-digit' });
  };

  const groups: { key: Bucket; items: Notice[] }[] = (['today', 'yesterday', 'earlier'] as const)
    .map((key) => ({ key, items: list.filter((n) => bucketOf(n) === key) })).filter((g) => g.items.length > 0);

  return (
    <main className="stack notify-page">
      <div className="title-row">
        <h1>{t('notify.title')}{unread > 0 && <span className="notify-count" aria-label={t('notify.unreadCount', { n: unread })}>{unread}</span>}</h1>
        {unread > 0 && <AsyncButton className="link-btn notify-markall" onClick={all}><CheckCheck size={16} aria-hidden /> {t('notify.markAll')}</AsyncButton>}
      </div>
      {list.length === 0 && (
        <div className="empty-state">
          <BellOff size={36} aria-hidden />
          <p className="muted">{t('notify.empty')}</p>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.key} className="notify-group">
          <h2 className="notify-group-title">{t(`notify.group.${g.key}`)}</h2>
          <ul className="plain-list notice-list">
            {g.items.map((n) => (
              <li key={n.id}>
                <button type="button" className={`notice${n.read ? '' : ' unread'}`} onClick={() => open(n)}>
                  <span className="notice-icon" aria-hidden>{ICONS[n.kind] ?? <Bell size={20} />}</span>
                  <span className="notice-main">
                    <strong className="notice-title">{n.title}</strong>
                    <span className="notice-body">{n.body}</span>
                  </span>
                  <span className="notice-side">
                    <span className="small muted">{when(n, g.key)}</span>
                    {!n.read && <span className="notice-dot" aria-hidden />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
