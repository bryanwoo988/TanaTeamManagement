import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n';
import ChangePhone from './ChangePhone';
import SubPage from './SubPage';

export default function AccountPage() {
  const { t } = useT();
  const { profile } = useAuth();
  return (
    <SubPage title={t('settings.accountTitle')}>
      <ChangePhone current={profile?.phone} />
    </SubPage>
  );
}
