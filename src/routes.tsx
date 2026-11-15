import { Navigate, Outlet } from 'react-router';
import { useAuth } from './auth/AuthProvider';
import LoginPage from './auth/LoginPage';
import ProfileSetup from './auth/ProfileSetup';
import { useT } from './i18n';
import FirstRunGate from './i18n/FirstRunGate';
import { TeamProvider } from './team/TeamContext';
import CalendarPage from './calendar/CalendarPage';
import CreateJoinPage from './team/CreateJoinPage';
import MembersPage from './team/MembersPage';
import NotificationsPage from './notify/NotificationsPage';
import InvoicesPage from './invoice/InvoicesPage';
import InvoiceDetail from './invoice/InvoiceDetail';
import CategoriesPage from './invoice/CategoriesPage';
import ExportPage from './export/ExportPage';
import SettingsPage from './settings/SettingsPage';
import AccountPage from './settings/AccountPage';
import NotificationsSettingsPage from './settings/NotificationsSettingsPage';
import AppearancePage from './settings/AppearancePage';
import SharePage from './settings/SharePage';
import AboutPage from './settings/AboutPage';
import BottomNav from './nav/BottomNav';
import PushBanner from './notify/PushBanner';
import ConfirmHost from './ui/ConfirmHost';
import Toaster from './ui/Toaster';

/** Login gate: signed out → login, signed in without a profile → name setup, else the app. */
function Gate() {
  const { user, profile, loading, error, retry } = useAuth();
  const { t } = useT();
  if (loading) return <main className="boot" aria-busy="true"><p className="muted">{t('loading')}</p></main>;
  if (!user) return <LoginPage />;
  if (error) {
    return (
      <main className="boot">
        <p className="err" role="alert">{t('auth.profileError')}</p>
        <button type="button" className="btn primary" onClick={retry}>{t('common.retry')}</button>
      </main>
    );
  }
  if (!profile) return <ProfileSetup />;
  return <TeamProvider><PushBanner /><Outlet /><BottomNav /></TeamProvider>;
}

function Shell() {
  return (
    <>
      <FirstRunGate><Gate /></FirstRunGate>
      <Toaster />
      <ConfirmHost />
    </>
  );
}

export const routes = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <CalendarPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/account', element: <AccountPage /> },
      { path: 'settings/notifications', element: <NotificationsSettingsPage /> },
      { path: 'settings/appearance', element: <AppearancePage /> },
      { path: 'settings/share', element: <SharePage /> },
      { path: 'settings/about', element: <AboutPage /> },
      { path: 'teams/new', element: <CreateJoinPage /> },
      { path: 'export', element: <ExportPage /> },
      { path: 'team/:teamId/export', element: <ExportPage /> },
      { path: 'team/:teamId/members', element: <MembersPage /> },
      { path: 'team/:teamId/invoices', element: <InvoicesPage /> },
      { path: 'team/:teamId/invoices/categories', element: <CategoriesPage /> },
      { path: 'team/:teamId/invoices/:invoiceId', element: <InvoiceDetail /> },
      // Old or mistyped links (e.g. from an earlier notification) go home rather than to a blank page.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
