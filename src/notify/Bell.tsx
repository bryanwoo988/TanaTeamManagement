import { Link } from 'react-router';
import { Bell as BellIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n';
import { useNotifications } from './notifications';

export default function Bell() {
  const { t } = useT();
  const { user } = useAuth();
  const unread = useNotifications(user?.uid).filter((n) => !n.read).length;
  return (
    <Link to="/notifications" className="btn bell" aria-label={unread ? t('notify.bellUnread', { n: unread }) : t('notify.bell')}>
      <BellIcon size={20} aria-hidden />
      {unread > 0 && <span className="bell-badge" aria-hidden>{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}
