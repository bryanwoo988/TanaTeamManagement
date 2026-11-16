import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import BackLink from '../nav/BackLink';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n';
import { canExportInvoices } from '../../shared/access';
import { klDate } from '../../shared/dates';
import { exportFilename } from '../../shared/export';
import type { ClaimStatus, InvoiceKind } from '../../shared/types';
import { fetchEvents, fetchMembers, type Scope } from '../calendar/data';
import { fetchInvoices, photoUrl, type InvoiceFilters } from '../invoice/data';
import { useTeams } from '../team/TeamContext';
import { toast } from '../ui/toast';
import { shareOrDownload } from './share';

type What = 'calendar' | 'invoices';
type Format = 'xlsx' | 'pdf';

function monthRange(today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ym = today.slice(0, 7);
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

/** Calendar export (all active members) and invoice export (admin/finance only), as Excel or PDF, shared or downloaded. */
export default function ExportPage() {
  const { teamId } = useParams();
  const { t, lang } = useT();
  const { user, profile } = useAuth();
  const { teams, member } = useTeams();
  const uid = user?.uid ?? '';
  const me = teamId ? member(teamId) : undefined;
  const canInvoices = !!teamId && canExportInvoices(me);
  const range = monthRange(klDate(new Date()));
  const [searchParams] = useSearchParams();
  const [what, setWhat] = useState<What>(searchParams.get('what') === 'invoices' ? 'invoices' : 'calendar');
  const [format, setFormat] = useState<Format>('xlsx');
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [kind, setKind] = useState<InvoiceKind | ''>('');
  const [status, setStatus] = useState<ClaimStatus | ''>('');
  const [busy, setBusy] = useState(false);
  const mode: What = what === 'invoices' && canInvoices ? 'invoices' : 'calendar';
  const teamName = teamId ? teams.find((x) => x.teamId === teamId)?.name ?? '' : t('team.personal');

  async function run() {
    if (!uid || busy || !from || !to || from > to) return;
    setBusy(true);
    try {
      const name = exportFilename(teamName || (teamId ?? 'personal'), mode, from, to, format);
      let blob: Blob | null = null;
      if (mode === 'calendar') {
        const scope: Scope = teamId ? { teamId } : 'personal';
        const [events, members] = await Promise.all([
          fetchEvents(scope, from, to),
          teamId ? fetchMembers(teamId) : Promise.resolve([{ uid, name: profile?.name ?? '' }]),
        ]);
        if (events.length) blob = format === 'xlsx'
          ? await (await import('./xlsx')).buildCalendarXlsx(events, members, lang)
          : await (await import('./pdf')).buildCalendarPdf(events, members, lang, from, to);
      } else {
        const filters: InvoiceFilters = { from, to, ...(kind && { kind }), ...(status && { status }) };
        const invoices = await fetchInvoices(teamId!, filters, { uid, all: true });
        if (invoices.length) {
          if (format === 'xlsx') blob = await (await import('./xlsx')).buildInvoiceXlsx(invoices, lang);
          else {
            const urls: Record<string, string | undefined> = {};
            await Promise.all(invoices.map(async (i) => { urls[i.id] = await photoUrl(i.photoPath).catch(() => undefined); }));
            blob = await (await import('./pdf')).buildInvoicePdf(invoices, urls, lang);
          }
        }
      }
      if (!blob) { toast({ kind: 'info', title: t('export.empty') }); return; }
      const result = await shareOrDownload(blob, name);
      if (result !== 'cancelled') toast({ kind: 'ok', title: t(result === 'shared' ? 'export.shared' : 'export.saved') });
    } catch (e) {
      console.error('export failed', e);
      toast({ kind: 'err', title: t('export.failed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="stack">
      <BackLink fallback={teamId && searchParams.get('what') === 'invoices' ? `/team/${teamId}/invoices` : '/'} />
      <h1>{t('export.title')}</h1>
      <section className="card stack">
        {canInvoices && (
          <fieldset className="radio-row">
            <legend>{t('export.what')}</legend>
            <label><input type="radio" name="what" checked={mode === 'calendar'} onChange={() => setWhat('calendar')} /> {t('cal.title')}</label>
            <label><input type="radio" name="what" checked={mode === 'invoices'} onChange={() => setWhat('invoices')} /> {t('inv.title')}</label>
          </fieldset>
        )}
        <fieldset className="radio-row">
          <legend>{t('export.format')}</legend>
          <label><input type="radio" name="format" checked={format === 'xlsx'} onChange={() => setFormat('xlsx')} /> Excel</label>
          <label><input type="radio" name="format" checked={format === 'pdf'} onChange={() => setFormat('pdf')} /> PDF</label>
        </fieldset>
        <label>{t('inv.from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>{t('inv.to')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {mode === 'invoices' && (
          <>
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
          </>
        )}
        <button type="button" className="btn primary block" disabled={busy || !from || !to || from > to} onClick={run}>{busy ? t('export.working') : t('export.go')}</button>
      </section>
    </main>
  );
}
