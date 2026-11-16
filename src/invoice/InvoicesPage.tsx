import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CalendarRange, Download, ImageIcon, Plus, Tags } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n';
import { canProcessClaims, canUploadClaims } from '../../shared/access';
import { formatRM } from '../../shared/money';
import type { ClaimStatus, InvoiceKind } from '../../shared/types';
import { useTeams } from '../team/TeamContext';
import TeamSwitcher from '../team/TeamSwitcher';
import InvoiceEditor from './InvoiceEditor';
import { applyInvoiceFilters } from './filters';
import { listInvoices, type InvoiceFilters, type InvoiceRow } from './data';
import { useTeamInfo } from './useTeamInfo';

const LOCALE = { zh: 'zh-CN', en: 'en-MY', ms: 'ms-MY' } as const;
const sum = (rows: InvoiceRow[]) => rows.reduce((n, r) => n + r.amountSen, 0);

/** Rows newest first, grouped by month ('YYYY-MM'). */
function byMonth(rows: InvoiceRow[]): [string, InvoiceRow[]][] {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const groups = new Map<string, InvoiceRow[]>();
  for (const r of sorted) {
    const k = r.date.slice(0, 7);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups];
}

export default function InvoicesPage() {
  const { teamId = '' } = useParams();
  const { t, lang } = useT();
  const { user, profile } = useAuth();
  const { member } = useTeams();
  const me = member(teamId);
  const uid = user?.uid ?? '';
  const finance = canProcessClaims(me);
  // Turned off by an admin: the button stays visible but greyed out, with a note (rules also refuse new claims).
  const uploadOff = !!me && !canUploadClaims(me);
  const info = useTeamInfo(teamId);
  const [kind, setKind] = useState<InvoiceKind | ''>('');
  const [status, setStatus] = useState<ClaimStatus | ''>('');
  const [mine, setMine] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [datesOpen, setDatesOpen] = useState(false);
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);

  const filters = useMemo<InvoiceFilters>(() => ({ ...(kind && { kind }), ...(status && { status }), ...(from && { from }), ...(to && { to }) }), [kind, status, from, to]);
  // One live subscription per viewer; the filters only narrow what is shown.
  useEffect(() => {
    if (!uid) return;
    setFailed(false);
    return listInvoices(teamId, {}, { uid, all: finance }, setRows, () => setFailed(true));
  }, [teamId, uid, finance]);
  const shown = useMemo(() => {
    if (!rows) return null;
    const f = applyInvoiceFilters(rows, filters);
    return mine ? f.filter((r) => r.uploadedBy === uid) : f;
  }, [rows, filters, mine, uid]);
  const groups = useMemo(() => (shown ? byMonth(shown) : []), [shown]);
  const pendingSen = useMemo(() => (shown ? sum(shown.filter((r) => r.status === 'pending')) : 0), [shown]);
  const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString(LOCALE[lang], { year: 'numeric', month: 'long' });
  const datesSet = !!(from || to);

  const chip = (pressed: boolean, onClick: () => void, label: string) => (
    <button type="button" className="chip small-chip" aria-pressed={pressed} onClick={onClick}>{label}</button>
  );

  return (
    <>
      <header className="topbar"><TeamSwitcher /></header>
      <main className="stack" aria-hidden={creating || undefined}>
        <div className="title-row">
          <h1>{t('inv.title')}</h1>
          <div className="title-actions">
            {finance && <Link className="icon-btn" to={`/team/${teamId}/export?what=invoices`} aria-label={t('export.link')} title={t('export.link')}><Download size={20} aria-hidden /></Link>}
            {me?.role === 'admin' && <Link className="icon-btn" to={`/team/${teamId}/invoices/categories`} aria-label={t('inv.categories')} title={t('inv.categories')}><Tags size={20} aria-hidden /></Link>}
            <button type="button" className={`btn primary new-btn${uploadOff ? ' is-disabled' : ''}`} aria-disabled={uploadOff || undefined}
              aria-describedby={uploadOff ? 'upload-off-note' : undefined} onClick={() => { if (!uploadOff) setCreating(true); }}>
              <Plus size={18} aria-hidden /><span>{t('inv.new')}</span>
            </button>
          </div>
        </div>
        {uploadOff && <p id="upload-off-note" className="muted small">{t('inv.uploadOff')}</p>}

        <div className="chips chip-scroll" role="group" aria-label={t('inv.filterType')}>
          {chip(kind === '', () => setKind(''), t('inv.all'))}
          {chip(kind === 'claim', () => setKind('claim'), t('inv.kind.claim'))}
          {chip(kind === 'company', () => setKind('company'), t('inv.kind.company'))}
          {chip(mine, () => setMine(!mine), t('inv.mine'))}
        </div>
        <div className="chips chip-scroll" role="group" aria-label={t('inv.filterStatus')}>
          {chip(status === '', () => setStatus(''), t('inv.allStatus'))}
          {chip(status === 'pending', () => setStatus('pending'), t('inv.status.pending'))}
          {chip(status === 'reimbursed', () => setStatus('reimbursed'), t('inv.status.reimbursed'))}
          {chip(status === 'rejected', () => setStatus('rejected'), t('inv.status.rejected'))}
          <button type="button" className="chip small-chip" aria-pressed={datesSet || undefined} aria-expanded={datesOpen} onClick={() => setDatesOpen(!datesOpen)}>
            <CalendarRange size={16} aria-hidden />{datesSet ? `${from || '…'} – ${to || '…'}` : t('inv.filterDate')}
          </button>
        </div>
        {datesOpen && (
          <section className="card date-range">
            <label>{t('inv.from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>{t('inv.to')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            {datesSet && <button type="button" className="link-btn" onClick={() => { setFrom(''); setTo(''); }}>{t('inv.clearDates')}</button>}
          </section>
        )}

        {failed && <p className="err" role="alert">{t('inv.loadError')}</p>}
        {!failed && shown === null && <p className="muted">{t('loading')}</p>}
        {!failed && shown?.length === 0 && <p className="muted">{t('inv.empty')}</p>}
        {!failed && !!shown?.length && (
          <>
            <p className="inv-summary" data-testid="inv-summary">
              <span>{t('inv.summary', { n: shown.length })}</span>
              <strong>{formatRM(sum(shown))}</strong>
              {finance && pendingSen > 0 && <span className="muted small">{t('inv.pendingTotal', { total: formatRM(pendingSen) })}</span>}
            </p>
            <ul className="plain-list inv-list">
              {groups.map(([ym, items]) => (
                <li key={ym} className="inv-month">
                  <div className="inv-month-head"><span>{monthName(ym)}</span><span>{formatRM(sum(items))}</span></div>
                  <ul className="plain-list">
                    {items.map((r) => (
                      <li key={r.id}>
                        <Link className="card inv-row" to={`/team/${teamId}/invoices/${r.id}`}>
                          <span className="inv-thumb" aria-hidden><ImageIcon size={20} /></span>
                          <span className="inv-main">
                            <span className="inv-vendor">{r.vendor || r.category}</span>
                            <span className="muted small">{r.date} · {t(`inv.kind.${r.kind}`)}</span>
                            <span className="muted small">{t('inv.by', { name: r.uploaderName })}</span>
                          </span>
                          <span className="inv-side">
                            <strong>{formatRM(r.amountSen)}</strong>
                            {r.status && <span className={`pill ${r.status}`}>{t(`inv.status.${r.status}`)}</span>}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      {creating && (
        <InvoiceEditor teamId={teamId} invoice={null} canProcess={finance} members={info.members} categories={info.categories}
          uploaderName={profile?.name ?? ''} onClose={() => setCreating(false)} />
      )}
    </>
  );
}
