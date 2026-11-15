import { NavLink } from 'react-router';
import { Bell, CalendarDays, Receipt, Settings } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n';
import { useNotifications } from '../notify/notifications';
import { useTeams } from '../team/TeamContext';

/** Bottom tab bar. Invoices only exist inside a team, so it is hidden in Personal scope. */
export default function BottomNav() {
  const { t } = useT();
  const { user } = useAuth();
  const { current } = useTeams();
  const unread = useNotifications(user?.uid).filter((n) => !n.read).length;
  return (
    <>
    <div className="nav-spacer" aria-hidden />
    <nav className="bottom-nav" aria-label={t('nav.main')}>
      <NavLink to="/" end><CalendarDays size={22} aria-hidden /><span>{t('nav.calendar')}</span></NavLink>
      {current !== 'personal' && (
        <NavLink to={`/team/${current}/invoices`}><Receipt size={22} aria-hidden /><span>{t('nav.invoices')}</span></NavLink>
      )}
      <NavLink to="/notifications" aria-label={unread ? t('notify.bellUnread', { n: unread }) : t('nav.notifications')}>
        <span className="nav-icon"><Bell size={22} aria-hidden />{unread > 0 && <span className="bell-badge" aria-hidden>{unread > 9 ? '9+' : unread}</span>}</span>
        <span>{t('nav.notifications')}</span>
      </NavLink>
      <NavLink to="/settings"><Settings size={22} aria-hidden /><span>{t('nav.settings')}</span></NavLink>
    </nav>
    </>
  );
}
