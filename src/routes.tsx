import { Outlet } from 'react-router';
import { useAuth } from './auth/AuthProvider';
import LoginPage from './auth/LoginPage';
import ProfileSetup from './auth/ProfileSetup';
import { useT } from './i18n';
import { TeamProvider } from './team/TeamContext';
import CalendarPage from './calendar/CalendarPage';
import CreateJoinPage from './team/CreateJoinPage';
import MembersPage from './team/MembersPage';
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
  return <TeamProvider><Outlet /></TeamProvider>;
}

function Shell() {
  return (
    <>
      <Gate />
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
      { path: 'teams/new', element: <CreateJoinPage /> },
      { path: 'team/:teamId/members', element: <MembersPage /> },
    ],
  },
];
