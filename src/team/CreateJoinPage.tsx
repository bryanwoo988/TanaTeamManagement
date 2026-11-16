import { useState } from 'react';
import BackLink from '../nav/BackLink';
import { createTeam, joinTeam } from '../api';
import { useT } from '../i18n';
import { authErrorKey, detailFor } from '../auth/authErrors';
import AsyncButton from '../ui/AsyncButton';
import { useTeams } from './TeamContext';

export default function CreateJoinPage() {
  const { t } = useT();
  const { setCurrent } = useTeams();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [joined, setJoined] = useState<'pending' | 'active' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function fail(e: unknown) {
    const key = authErrorKey(e);
    const detail = detailFor(key, e);
    setErr(t(key) + (detail ? ` (${detail})` : ''));
    throw e;
  }

  async function create() {
    setErr(null);
    if (!name.trim()) return;
    try {
      const r = await createTeam(name.trim());
      setCreated(r.code);
      setCurrent(r.teamId);
    } catch (e) { fail(e); }
  }

  async function join() {
    setErr(null);
    if (!code.trim()) return;
    try {
      const r = await joinTeam(code.trim());
      setJoined(r.status);
      if (r.status === 'active') setCurrent(r.teamId);
    } catch (e) { fail(e); }
  }

  return (
    <main className="stack">
      <BackLink />
      {err && <p className="err" role="alert">{err}</p>}
      <section className="card">
        <h2>{t('team.createTitle')}</h2>
        <label htmlFor="team-name">{t('team.name')}</label>
        <input id="team-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <AsyncButton onClick={create} disabled={!name.trim()} style={{ marginTop: 12 }}>{t('team.create')}</AsyncButton>
        {created && <p className="ok" style={{ marginTop: 12 }}>{t('team.code')}: <strong>{created}</strong></p>}
      </section>
      <section className="card">
        <h2>{t('team.joinTitle')}</h2>
        <label htmlFor="join-code">{t('team.code')}</label>
        <input id="join-code" value={code} autoCapitalize="characters" onChange={(e) => setCode(e.target.value)} />
        <AsyncButton onClick={join} disabled={!code.trim()} style={{ marginTop: 12 }}>{t('team.join')}</AsyncButton>
        {joined && <p className="ok" style={{ marginTop: 12 }}>{t(joined === 'pending' ? 'team.joinedPending' : 'team.joinedActive')}</p>}
      </section>
    </main>
  );
}
