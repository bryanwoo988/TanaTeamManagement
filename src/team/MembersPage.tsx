import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { collection, deleteDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { addMemberByPhone, cancelPhoneInvite, getInviteCode, resetInviteCode } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { authErrorKey } from '../auth/authErrors';
import { t, useT, type MessageKey } from '../i18n';
import AsyncButton from '../ui/AsyncButton';
import { confirmSheet } from '../ui/confirm';
import { toast, toastError } from '../ui/toast';
import { normalizeMyPhone } from '../../shared/phone';
import { isActive } from '../../shared/access';
import type { MemberDoc, PhoneInviteDoc, Role } from '../../shared/types';
import { useTeams } from './TeamContext';

const ROLES: Role[] = ['admin', 'finance', 'member'];

function reportError(e: unknown) {
  const key = authErrorKey(e);
  if (key === 'common.error') toastError();
  else toast({ kind: 'err', title: t(key) });
}

export default function MembersPage() {
  const { teamId = '' } = useParams();
  const { t } = useT();
  const { user } = useAuth();
  const { member } = useTeams();
  const me = member(teamId);
  const admin = isActive(me) && me?.role === 'admin';
  const [members, setMembers] = useState<(MemberDoc & { id: string })[]>([]);
  const [invites, setInvites] = useState<(PhoneInviteDoc & { id: string })[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [err, setErr] = useState<MessageKey | null>(null);

  useEffect(() => onSnapshot(collection(db, 'teams', teamId, 'members'),
    (s) => setMembers(s.docs.map((d) => ({ ...(d.data() as MemberDoc), id: d.id }))), () => {}), [teamId]);

  useEffect(() => {
    if (!admin) return;
    const unsub = onSnapshot(query(collection(db, 'phoneInvites'), where('teamId', '==', teamId)),
      (s) => setInvites(s.docs.map((d) => ({ ...(d.data() as PhoneInviteDoc), id: d.id }))), () => {});
    getInviteCode(teamId).then((r) => setCode(r.code)).catch(() => {});
    return unsub;
  }, [admin, teamId]);

  const ref = (id: string) => doc(db, 'teams', teamId, 'members', id);
  const guard = (fn: () => Promise<unknown>) => fn().catch(reportError);

  async function removeMember(m: MemberDoc & { id: string }, titleKey: 'team.removeTitle' | 'team.rejectTitle', label: MessageKey) {
    const ok = await confirmSheet({ title: t(titleKey, { name: m.name }), confirmLabel: t(label), danger: true });
    if (ok) await guard(() => deleteDoc(ref(m.id)));
  }

  async function add() {
    setErr(null);
    const p = normalizeMyPhone(phone);
    // Throw on invalid input so the button does not flash "Done".
    if (!p.ok) { setErr('login.invalidPhone'); throw new Error('invalid phone'); }
    if (!name.trim()) throw new Error('missing name');
    try {
      const r = await addMemberByPhone(teamId, p.e164, name.trim(), role);
      toast({ kind: 'ok', title: t(r.status === 'added' ? 'team.added' : 'team.invited') });
      setPhone(''); setName('');
    } catch (e) { reportError(e); throw e; }
  }

  async function reset() {
    try { setCode((await resetInviteCode(teamId)).code); } catch (e) { reportError(e); throw e; }
  }

  const pending = admin ? members.filter((m) => m.status === 'pending') : [];
  const active = members.filter((m) => m.status === 'active');

  return (
    <main className="stack">
      <p><Link to="/">{t('back')}</Link></p>
      <h1>{t('team.members')}</h1>

      {admin && (
        <section className="card">
          <h2>{t('team.inviteCode')}</h2>
          <p><strong>{code ?? '…'}</strong></p>
          <AsyncButton className="btn" onClick={async () => {
            if (!(await confirmSheet({ title: t('team.resetCode'), body: t('team.resetConfirm'), danger: true }))) throw new Error('cancelled');
            await reset();
          }}>{t('team.resetCode')}</AsyncButton>
        </section>
      )}

      {pending.length > 0 && (
        <section className="card">
          <h2>{t('team.pendingList')}</h2>
          <ul className="plain-list">
            {pending.map((m) => (
              <li key={m.id}>
                <span>{m.name}</span>
                <button type="button" className="btn primary" onClick={() => guard(() => updateDoc(ref(m.id), { status: 'active' }))}>{t('team.approve')}</button>
                <button type="button" className="btn" onClick={() => removeMember(m, 'team.rejectTitle', 'team.reject')}>{t('team.reject')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>{t('team.members')}</h2>
        {active.length === 0 && <p className="muted">{t('team.noMembers')}</p>}
        <ul className="plain-list">
          {active.map((m) => {
            const isMe = m.id === user?.uid;
            return (
              <li key={m.id}>
                <span>{m.name}{isMe && <span className="muted"> {t('team.you')}</span>}</span>
                {admin && !isMe ? (
                  <>
                    <select aria-label={t('team.role')} value={m.role} onChange={(e) => guard(() => updateDoc(ref(m.id), { role: e.target.value }))}>
                      {ROLES.map((r) => <option key={r} value={r}>{t(`team.role.${r}`)}</option>)}
                    </select>
                    <button type="button" className="btn danger" onClick={() => removeMember(m, 'team.removeTitle', 'team.remove')}>{t('team.remove')}</button>
                  </>
                ) : <span className="muted small">{t(`team.role.${m.role}`)}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      {admin && invites.length > 0 && (
        <section className="card">
          <h2>{t('team.invites')}</h2>
          <ul className="plain-list">
            {invites.map((i) => (
              <li key={i.id}>
                <span>{i.name} <span className="muted small">{i.phone}</span></span>
                <button type="button" className="btn" onClick={() => guard(() => cancelPhoneInvite(teamId, i.phone))}>{t('team.cancelInvite')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {admin && (
        <section className="card">
          <h2>{t('team.addByPhone')}</h2>
          {err && <p className="err" role="alert">{t(err)}</p>}
          <label htmlFor="add-phone">{t('team.phone')}</label>
          <input id="add-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <label htmlFor="add-name">{t('team.memberName')}</label>
          <input id="add-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <label htmlFor="add-role">{t('team.role')}</label>
          <select id="add-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`team.role.${r}`)}</option>)}
          </select>
          <AsyncButton onClick={add} style={{ marginTop: 12 }}>{t('team.add')}</AsyncButton>
        </section>
      )}
    </main>
  );
}
