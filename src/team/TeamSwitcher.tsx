import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, Plus } from 'lucide-react';
import { useT } from '../i18n';
import { isActive } from '../../shared/access';
import { useTeams } from './TeamContext';

export default function TeamSwitcher() {
  const { t } = useT();
  const { teams, current, setCurrent } = useTeams();
  const [open, setOpen] = useState(false);
  const label = current === 'personal' ? t('team.personal') : (teams.find((x) => x.teamId === current)?.name ?? t('team.personal'));

  function pick(id: string) {
    setCurrent(id);
    setOpen(false);
  }

  return (
    <div className="team-switcher">
      <button type="button" className="btn" aria-haspopup="listbox" aria-expanded={open} aria-label={t('team.switcher')} onClick={() => setOpen((o) => !o)}>
        {label}<ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <div className="team-menu card">
          <ul role="listbox" aria-label={t('team.switcher')} className="team-list">
            <li role="option" aria-selected={current === 'personal'} onClick={() => pick('personal')}>{t('team.personal')}</li>
            {teams.map((tm) => isActive(tm) ? (
              <li key={tm.teamId} role="option" aria-selected={current === tm.teamId} onClick={() => pick(tm.teamId)}>{tm.name}</li>
            ) : (
              <li key={tm.teamId} role="option" aria-selected={false} aria-disabled="true" className="muted">
                {tm.name} <span className="small">{t('team.pendingApproval')}</span>
              </li>
            ))}
          </ul>
          <Link to="/teams/new" className="btn block" onClick={() => setOpen(false)}><Plus size={16} aria-hidden />{t('team.new')}</Link>
        </div>
      )}
    </div>
  );
}
