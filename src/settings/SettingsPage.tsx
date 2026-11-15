import { useState } from 'react';
import { Link } from 'react-router';
import { leaveTeam } from '../api';
import { signOut, useAuth } from '../auth/AuthProvider';
import { authErrorKey } from '../auth/authErrors';
import { useT, type MessageKey } from '../i18n';
import LanguagePicker from '../i18n/LanguagePicker';
import NotifySettings from '../notify/NotifySettings';
import AppearanceSettings from '../theme/AppearanceSettings';
import TeamSwitcher from '../team/TeamSwitcher';
import { useTeams } from '../team/TeamContext';
import AsyncButton from '../ui/AsyncButton';
import { confirmSheet } from '../ui/confirm';
import { toast } from '../ui/toast';
import { isActive } from '../../shared/access';
import ChangePhone from './ChangePhone';

export default function SettingsPage() {
  const { t } = useT();
  const { profile } = useAuth();
  const { teams, current, setCurrent, member } = useTeams();
  const [leaveError, setLeaveError] = useState<MessageKey | null>(null);
  const teamId = current === 'personal' ? null : current;
  const me = teamId ? member(teamId) : undefined;
  const teamName = teams.find((x) => x.teamId === teamId)?.name ?? '';
  const admin = isActive(me) && me?.role === 'admin';

  async function leave() {
    if (!teamId) return;
    setLeaveError(null);
    const ok = await confirmSheet({ title: t('settings.leaveTitle', { name: teamName }), body: t('settings.leaveBody'), confirmLabel: t('settings.leave'), danger: true });
    if (!ok) throw new Error('cancelled'); // no "Done" flash when the person backs out
    try {
      await leaveTeam(teamId);
    } catch (e) {
      setLeaveError(authErrorKey(e));
      throw e;
    }
    setCurrent('personal');
    toast({ kind: 'ok', title: t('settings.left') });
  }

  return (
    <main className="stack">
      <header className="topbar"><TeamSwitcher /></header>
      <h1>{t('settings.title')}</h1>

      <section className="card stack">
        <h2>{t('settings.language')}</h2>
        <LanguagePicker />
      </section>

      <AppearanceSettings />
      <NotifySettings />
      <ChangePhone current={profile?.phone} />

      {teamId && (
        <section className="card stack" aria-label={t('settings.team', { name: teamName })}>
          <h2>{t('settings.team', { name: teamName })}</h2>
          <Link className="btn block" to={`/team/${teamId}/members`}>{t('team.members')}</Link>
          {admin && <Link className="btn block" to={`/team/${teamId}/invoices/categories`}>{t('inv.categories')}</Link>}
          <Link className="btn block" to={`/team/${teamId}/export`}>{t('export.link')}</Link>
          {leaveError && <p className="err" role="alert">{t(leaveError)}</p>}
          <AsyncButton className="btn danger block" onClick={leave}>{t('settings.leave')}</AsyncButton>
        </section>
      )}

      <section className="card stack">
        <h2>{t('settings.account')}</h2>
        <AsyncButton className="btn block" onClick={signOut}>{t('common.signOut')}</AsyncButton>
      </section>
    </main>
  );
}
