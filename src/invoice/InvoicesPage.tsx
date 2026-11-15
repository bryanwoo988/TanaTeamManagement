import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n';
import { canProcessClaims } from '../../shared/access';
import { formatRM } from '../../shared/money';
import type { ClaimStatus, InvoiceKind } from '../../shared/types';
import { useTeams } from '../team/TeamContext';
import Bell from '../notify/Bell';
import TeamSwitcher from '../team/TeamSwitcher';
import InvoiceEditor from './InvoiceEditor';
import { listInvoices, type InvoiceFilters, type InvoiceRow } from './data';
import { useTeamInfo } from './useTeamInfo';

export default function InvoicesPage() {
  const { teamId = '' } = useParams();
  const { t } = useT();
  const { user, profile } = useAuth();
  const { member } = useTeams();
  const me = member(teamId);
  const uid = user?.uid ?? '';
  const finance = canProcessClaims(me);
  const info = useTeamInfo(teamId);
  const [kind, setKind] = useState<InvoiceKind | ''>('');
  const [status, setStatus] = useState<ClaimStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [creating, setCreating] = useState(false);

  const filters = useMemo<InvoiceFilters>(() => ({ ...(kind && { kind }), ...(status && { status }), ...(from && { from }), ...(to && { to }) }), [kind, status, from, to]);
  useEffect(() => {
    if (!uid) return;
    return listInvoices(teamId, filters, { uid, all: finance }, setRows, () => setRows([]));
  }, [teamId, filters, uid, finance]);

  return (
    <>
      <header className="topbar"><TeamSwitcher /><Bell /></header>
      <main className="stack" aria-hidden={creating || undefined}>
        <p><Link to="/">{t('back')}</Link></p>
        <h1>{t('inv.title')}</h1>
        <button type="button" className="btn primary block" onClick={() => setCreating(true)}>{t('inv.new')}</button>
        {me?.role === 'admin' && <Link to={`/team/${teamId}/invoices/categories`}>{t('inv.categories')}</Link>}

        <section className="card stack">
          <label>{t('inv.filterType')}
            <select value={kind} onChange={(e) => setKind(e.target.value as InvoiceKind | '')}>
              <option value="">{t('inv.all')}</option>
              <option value="claim">{t('inv.kind.claim')}</option>
              <option value="company">{t('inv.kind.company')}</option>
            </select>
          </label>
          <label>{t('inv.filterStatus')}
            <select value={status} onChange={(e) => setStatus(e.target.value as ClaimStatus | '')}>
              <option value="">{t('inv.all')}</option>
              <option value="pending">{t('inv.status.pending')}</option>
              <option value="reimbursed">{t('inv.status.reimbursed')}</option>
              <option value="rejected">{t('inv.status.rejected')}</option>
            </select>
          </label>
          <label>{t('inv.from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>{t('inv.to')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </section>

        {rows === null && <p className="muted">{t('loading')}</p>}
        {rows?.length === 0 && <p className="muted">{t('inv.empty')}</p>}
        {!!rows?.length && (
          <ul className="plain-list">
            {rows.map((r) => (
              <li key={r.id}>
                <Link className="card inv-row" to={`/team/${teamId}/invoices/${r.id}`}>
                  <strong>{formatRM(r.amountSen)}</strong>
                  <span>{r.vendor || r.category}</span>
                  <span className="muted small">{r.date} · {t(`inv.kind.${r.kind}`)}{r.status ? ` · ` : ''}{r.status && <span className={`pill ${r.status}`}>{t(`inv.status.${r.status}`)}</span>}</span>
                  <span className="muted small">{t('inv.by', { name: r.uploaderName })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      {creating && (
        <InvoiceEditor teamId={teamId} invoice={null} canProcess={finance} members={info.members} categories={info.categories}
          uploaderName={profile?.name ?? ''} onClose={() => setCreating(false)} />
      )}
    </>
  );
}
