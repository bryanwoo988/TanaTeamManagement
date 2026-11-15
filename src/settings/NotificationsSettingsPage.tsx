import { useT } from '../i18n';
import NotifySettings from '../notify/NotifySettings';
import SubPage from './SubPage';

export default function NotificationsSettingsPage() {
  const { t } = useT();
  return <SubPage title={t('settings.notifications')}><NotifySettings /></SubPage>;
}
