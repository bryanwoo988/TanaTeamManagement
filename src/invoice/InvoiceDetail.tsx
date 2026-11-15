import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n';
import { canProcessClaims } from '../../shared/access';
import { klDate } from '../../shared/dates';
import { formatRM } from '../../shared/money';
import { useTeams } from '../team/TeamContext';
import AsyncButton from '../ui/AsyncButton';
import { confirmSheet } from '../ui/confirm';
import { toast, toastError } from '../ui/toast';
import InvoiceEditor from './InvoiceEditor';
import PhotoViewer from '../ui/PhotoViewer';
import { deleteInvoice, getLinkedEvent, photoUrl, resubmitClaim, setClaimStatus, watchInvoice, type InvoiceRow } from './data';
import { useTeamInfo } from './useTeamInfo';

export default function InvoiceDetail() {
  const { teamId = '', invoiceId = '' } = useParams();
  const { t } = useT();
  const nav = useNavigate();
  const { user, profile } = useAuth();
  const { member } = useTeams();
  const info = useTeamInfo(teamId);
  const uid = user?.uid ?? '';
  const finance = canProcessClaims(member(teamId));
  const [inv, setInv] = useState<InvoiceRow | null | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [paidDate, setPaidDate] = useState(() => klDate(new Date()));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [work, setWork] = useState<{ id: string; title: string; date: string } | null>(null);

  useEffect(() => watchInvoice(teamId, invoiceId, (r, p) => { setInv(r); setPending(p); }), [teamId, invoiceId]);
  const photoPath = inv?.photoPath;
  useEffect(() => {
    // Storage only serves a photo once its invoice doc is on the server: wait out a pending write, then fetch.
    if (!photoPath || pending) return;
    let live = true;
    photoUrl(photoPath).then((u) => live && setUrl(u)).catch(() => {});
    return () => { live = false; };
  }, [photoPath, pending]);

  const eventId = inv?.eventId;
  useEffect(() => {
    if (!eventId) return;
    let live = true;
    getLinkedEvent(teamId, eventId).then((e) => live && setWork(e && { id: eventId, ...e }));
    return () => { live = false; };
  }, [teamId, eventId]);

  if (inv === undefined) return <main className="boot" aria-busy="true"><p className="muted">{t('loading')}</p></main>;
  if (inv === null) return <main className="stack"><p><Link to={`/team/${teamId}/invoices`}>{t('back')}</Link></p><p className="muted">{t('inv.notFound')}</p></main>;

  const claim = inv.kind === 'claim';
  const own = claim && inv.uploadedBy === uid;
  const ownerOpen = own && (inv.status === 'pending' || inv.status === 'rejected');
  const canEdit = ownerOpen || (finance && !claim);
  const canDelete = finance || ownerOpen;
  const names = new Map(info.members.map((m) => [m.uid, m.name]));

  async function run(fn: () => Promise<unknown>) {
    try { await fn(); } catch (e) { toastError(); throw e; }
  }
  async function reject() {
    setErr(null);
    const r = reason.trim();
    if (!r) { setErr(t('inv.reasonRequired')); throw new Error('reason.required'); }
    if (r.length > 300) { setErr(t('inv.reasonTooLong')); throw new Error('reason.tooLong'); }
    await run(() => setClaimStatus(teamId, inv!.id, 'rejected', { reason: r }));
    setReason('');
  }
  async function remove() {
    if (!(await confirmSheet({ title: t('inv.deleteTitle'), body: inv!.vendor || formatRM(inv!.amountSen), confirmLabel: t('delete'), danger: true }))) throw new Error('cancelled');
    await run(() => deleteInvoice(teamId, inv!.id));
    nav(`/team/${teamId}/invoices`, { replace: true });
  }

  return (
    <>
      <main className="stack" aria-hidden={editing || undefined}>
        <p><Link to={`/team/${teamId}/invoices`}>{t('back')}</Link></p>
        <h1>{formatRM(inv.amountSen)}</h1>
        <section className="card stack">
          <p><strong>{inv.vendor || inv.category}</strong></p>
          <p className="muted">{inv.date} · {t(`inv.kind.${inv.kind}`)} · {inv.category}</p>
          <p className="muted small">{t('inv.by', { name: inv.uploaderName })}</p>
          {inv.status && <p><span className={`pill ${inv.status}`}>{t(`inv.status.${inv.status}`)}</span></p>}
          {inv.status === 'rejected' && inv.rejectReason && <p className="err">{t('inv.rejectedWhy', { reason: inv.rejectReason })}</p>}
          {inv.status === 'reimbursed' && inv.paidDate && <p>{t('inv.paidOn', { date: inv.paidDate })}</p>}
          {inv.notes && <p>{inv.notes}</p>}
          {!claim && inv.relatedUids.length > 0 && (
            <p>{t('inv.relatedPeople')}: {inv.relatedUids.map((u) => names.get(u) ?? u).join(', ')}</p>
          )}
          {work && work.id === inv.eventId && <p>{`${t('inv.linkedWork')}: ${work.title} · ${work.date}`}</p>}
          {url && (
            <button type="button" className="photo-button" aria-label={t('inv.photo')} onClick={() => setViewing(true)}>
              <img className="photo-full" src={url} alt={t('inv.photo')} />
            </button>
          )}
          {viewing && url && <PhotoViewer src={url} alt={t('inv.photo')} onClose={() => setViewing(false)} />}
        </section>

        {finance && claim && inv.status === 'pending' && (
          <section className="card stack">
            <label>{t('inv.paidDate')}<input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></label>
            <AsyncButton onClick={() => run(() => setClaimStatus(teamId, inv.id, 'reimbursed', { paidDate }))}>{t('inv.reimburse')}</AsyncButton>
            <label>{t('inv.rejectReason')}<textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></label>
            {err && <p className="err" role="alert">{err}</p>}
            <AsyncButton className="btn danger block" onClick={reject}>{t('inv.reject')}</AsyncButton>
          </section>
        )}
        {own && inv.status === 'rejected' && (
          <AsyncButton onClick={async () => { await run(() => resubmitClaim(teamId, inv.id)); toast({ kind: 'ok', title: t('inv.resubmitted') }); }}>{t('inv.resubmit')}</AsyncButton>
        )}
        {canEdit && <button type="button" className="btn block" onClick={() => setEditing(true)}>{t('inv.edit')}</button>}
        {canDelete && <AsyncButton className="btn danger block" onClick={remove}>{t('delete')}</AsyncButton>}
      </main>
      {editing && (
        <InvoiceEditor teamId={teamId} invoice={inv} canProcess={finance} members={info.members} categories={info.categories}
          uploaderName={profile?.name ?? ''} onClose={() => setEditing(false)} />
      )}
    </>
  );
}
