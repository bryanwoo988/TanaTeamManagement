import { useT } from '../i18n';
import AppearanceSettings from '../theme/AppearanceSettings';
import SubPage from './SubPage';

export default function AppearancePage() {
  const { t } = useT();
  return <SubPage title={t('settings.appearance')}><AppearanceSettings /></SubPage>;
}
