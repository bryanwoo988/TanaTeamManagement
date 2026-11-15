import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Bell, ChevronRight, Info, Palette, Share2, Users, Tags, FileDown, UserRound } from 'lucide-react';
import { leaveTeam } from '../api';
import { signOut, useAuth } from '../auth/AuthProvider';
import { authErrorKey } from '../auth/authErrors';
import { useT, type MessageKey } from '../i18n';
import { useChooseLang } from '../i18n/useChooseLang';
import { resolvePushState, pushState, type PushState } from '../notify/push';
import { useAppearance } from '../theme/appearance';
import { formatLocalPhone } from '../ui/PhoneInput';
import TeamSwitcher from '../team/TeamSwitcher';
import { useTeams } from '../team/TeamContext';
import AsyncButton from '../ui/AsyncButton';
import { confirmSheet } from '../ui/confirm';
import { toast } from '../ui/toast';
import { isActive } from '../../shared/access';
import type { Lang } from '../../shared/types';
import { APP_VERSION, BUILD_TIME, formatKL } from './changelog';

const LANGS: { lang: Lang; label: string }[] = [
  { lang: 'zh', label: '华语' },
  { lang: 'en', label: 'English' },
  { lang: 'ms', label: 'Melayu' },
];

function NavRow({ to, icon, label, value }: { to: string; icon: ReactNode; label: string; value?: string }) {
  return (
    <Link className="list-row" to={to}>
      <span className="list-icon" aria-hidden>{icon}</span>
      <span className="list-label">{label}</span>
      {value && <span className="list-value muted">{value}</span>}
      <ChevronRight size={18} className="list-chev" aria-hidden />
    </Link>
  );
}

export default function SettingsPage() {
  const { t, lang } = useT();
  const chooseLang = useChooseLang();
  const appearance = useAppearance();
  const { user, profile } = useAuth();
  const [push, setPush] = useState<PushState>(pushState);
  useEffect(() => {
    if (!user?.uid) return;
    let live = true;
    resolvePushState(user.uid).then((v) => { if (live) setPush(v); }).catch(() => {});
    return () => { live = false; };
  }, [user?.uid]);
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

  const modeLabel = appearance.mode === 'system' ? t('appearanceModeSystem') : appearance.mode === 'light' ? t('appearanceModeLight') : t('appearanceModeDark');
  const phone = profile?.phone ? `+60 ${formatLocalPhone(profile.phone)}` : '';

  return (
    <main className="stack">
      <header className="topbar"><TeamSwitcher /></header>
      <h1>{t('settings.title')}</h1>

      <div className="list-group">
        <Link className="list-row profile-row" to="/settings/account">
          <span className="list-icon" aria-hidden><UserRound size={20} /></span>
          <span className="list-label"><strong>{profile?.name}</strong><span className="muted small block-text">{phone}</span></span>
          <ChevronRight size={18} className="list-chev" aria-hidden />
        </Link>
      </div>

      {teamId && (
        <>
          <h2 className="group-title">{teamName}</h2>
          <section className="list-group" aria-label={t('settings.team', { name: teamName })}>
            <NavRow to={`/team/${teamId}/members`} icon={<Users size={20} />} label={t('team.members')} />
            {admin && <NavRow to={`/team/${teamId}/invoices/categories`} icon={<Tags size={20} />} label={t('inv.categories')} />}
            <NavRow to={`/team/${teamId}/export`} icon={<FileDown size={20} />} label={t('export.link')} />
          </section>
          {leaveError && <p className="err" role="alert">{t(leaveError)}</p>}
          <AsyncButton className="btn danger block" onClick={leave}>{t('settings.leave')}</AsyncButton>
        </>
      )}

      <div className="list-group">
        <NavRow to="/settings/notifications" icon={<Bell size={20} />} label={t('settings.notifications')} value={push === 'on' ? t('settings.on') : t('settings.off')} />
        <NavRow to="/settings/appearance" icon={<Palette size={20} />} label={t('settings.appearance')} value={modeLabel} />
        <div className="list-row lang-row">
          <span className="list-label">{t('settings.language')}</span>
          <div className="segmented lang-seg" role="group" aria-label={t('settings.language')}>
            {LANGS.map((o) => (
              <button key={o.lang} type="button" aria-pressed={lang === o.lang} onClick={() => chooseLang(o.lang)}>{o.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="list-group">
        <NavRow to="/settings/share" icon={<Share2 size={20} />} label={t('settings.share')} />
        <NavRow to="/settings/about" icon={<Info size={20} />} label={t('settings.about')} value={`v${APP_VERSION} · ${formatKL(BUILD_TIME).slice(0, 10)}`} />
      </div>

      <AsyncButton className="btn block" onClick={signOut}>{t('common.signOut')}</AsyncButton>
      <p className="small muted version-line">{t('settings.versionLine', { version: APP_VERSION })}</p>
    </main>
  );
}
