import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useT } from '../i18n';
import { isActive } from '../../shared/access';
import { useTeams } from '../team/TeamContext';
import AsyncButton from '../ui/AsyncButton';
import { toast, toastError } from '../ui/toast';
import { saveCategories } from './data';
import { useTeamInfo } from './useTeamInfo';

const MAX_CATEGORIES = 50;

/** Admin-only: the list of invoice categories (team.categories). */
export default function CategoriesPage() {
  const { teamId = '' } = useParams();
  const { t } = useT();
  const me = useTeams().member(teamId);
  const saved = useTeamInfo(teamId).categories;
  const [list, setList] = useState(saved);
  const [draft, setDraft] = useState('');
  useEffect(() => setList(saved), [saved]);

  async function persist(next: string[]) {
    try { await saveCategories(teamId, next); } catch (e) { toastError(); throw e; }
    setList(next);
    toast({ kind: 'ok', title: t('inv.saved') });
  }
  async function save() {
    const name = draft.trim().slice(0, 60);
    const next = name && !list.includes(name) && list.length < MAX_CATEGORIES ? [...list, name] : list;
    await persist(next);
    setDraft('');
  }

  return (
    <main className="stack">
      <p><Link to={`/team/${teamId}/invoices`}>{t('back')}</Link></p>
      <h1>{t('inv.categories')}</h1>
      {!(isActive(me) && me?.role === 'admin') ? <p className="muted">{t('inv.adminOnly')}</p> : (
        <>
          <ul className="plain-list">
            {list.map((c) => (
              <li key={c}>
                <span>{c}</span>
                <AsyncButton className="btn danger" onClick={() => persist(list.filter((x) => x !== c))}>{t('inv.categoryRemove', { name: c })}</AsyncButton>
              </li>
            ))}
          </ul>
          <label>{t('inv.categoryAdd')}<input value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} /></label>
          <AsyncButton onClick={save}>{t('save')}</AsyncButton>
        </>
      )}
    </main>
  );
}
