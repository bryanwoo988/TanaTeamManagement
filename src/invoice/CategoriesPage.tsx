import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Trash2 } from 'lucide-react';
import BackLink from '../nav/BackLink';
import { confirmSheet } from '../ui/confirm';
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
  const { member, loaded } = useTeams();
  const me = member(teamId);
  const saved = useTeamInfo(teamId).categories;
  const [list, setList] = useState(saved);
  const [draft, setDraft] = useState('');
  useEffect(() => setList(saved), [saved]);

  async function persist(next: string[]) {
    try { await saveCategories(teamId, next); } catch (e) { toastError(); throw e; }
    setList(next);
    toast({ kind: 'ok', title: t('inv.saved') });
  }
  async function remove(c: string) {
    if (!(await confirmSheet({ title: t('inv.categoryRemove', { name: c }), confirmLabel: t('delete'), danger: true }))) return;
    await persist(list.filter((x) => x !== c)).catch(() => {});
  }
  async function save() {
    const name = draft.trim().slice(0, 60);
    if (!name) return; // nothing to add
    if (!list.includes(name) && list.length < MAX_CATEGORIES) await persist([...list, name]);
    setDraft('');
  }

  return (
    <main className="stack">
      <BackLink fallback={`/team/${teamId}/invoices`} />
      <h1>{t('inv.categories')}</h1>
      {loaded === false ? <p className="muted">{t('loading')}</p> : !(isActive(me) && me?.role === 'admin') ? <p className="muted">{t('inv.adminOnly')}</p> : (
        <>
          <div className="list-group">
            {list.map((c) => (
              <div key={c} className="list-row">
                <span className="list-label">{c}</span>
                <button type="button" className="icon-btn danger-icon" aria-label={t('inv.categoryRemove', { name: c })} title={t('inv.categoryRemove', { name: c })} onClick={() => remove(c)}>
                  <Trash2 size={20} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <section className="card stack">
            <label>{t('inv.categoryAdd')}<input value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} /></label>
            <AsyncButton onClick={save}>{t('save')}</AsyncButton>
          </section>
        </>
      )}
    </main>
  );
}
