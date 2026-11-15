import { formatRM } from './money';
import type { EventDoc, InvoiceDoc, Lang, MemberDoc } from './types';

/** Text printed inside exported files, in the exporter's language (kept apart from the app dictionaries: files carry their own wording). */
export interface ExportLabels {
  allDay: string;
  cal: { title: string; date: string; time: string; event: string; assignees: string; place: string; notes: string };
  inv: { title: string; date: string; kind: string; vendor: string; category: string; uploader: string; status: string; paidDate: string; notes: string; amount: string; total: string; receipt: string; photoUnavailable: string };
  kind: { claim: string; company: string };
  status: { pending: string; reimbursed: string; rejected: string };
}

const LABELS: Record<Lang, ExportLabels> = {
  en: {
    allDay: 'All day',
    cal: { title: 'Calendar', date: 'Date', time: 'Time', event: 'Event', assignees: 'Assigned to', place: 'Place', notes: 'Notes' },
    inv: { title: 'Invoices', date: 'Date', kind: 'Type', vendor: 'Vendor', category: 'Category', uploader: 'Uploaded by', status: 'Status', paidDate: 'Paid on', notes: 'Notes', amount: 'Amount (RM)', total: 'Total', receipt: 'Receipt', photoUnavailable: 'Photo unavailable' },
    kind: { claim: 'Staff claim', company: 'Company invoice' },
    status: { pending: 'Pending', reimbursed: 'Reimbursed', rejected: 'Rejected' },
  },
  zh: {
    allDay: '全天',
    cal: { title: '日历', date: '日期', time: '时间', event: '事项', assignees: '负责人', place: '地点', notes: '备注' },
    inv: { title: '发票与报销', date: '日期', kind: '类型', vendor: '商家', category: '类别', uploader: '上传者', status: '状态', paidDate: '付款日期', notes: '备注', amount: '金额 (RM)', total: '合计', receipt: '单据', photoUnavailable: '照片无法显示' },
    kind: { claim: '员工报销', company: '公司发票' },
    status: { pending: '待处理', reimbursed: '已报销', rejected: '已拒绝' },
  },
  ms: {
    allDay: 'Sepanjang hari',
    cal: { title: 'Kalendar', date: 'Tarikh', time: 'Masa', event: 'Acara', assignees: 'Ditugaskan kepada', place: 'Tempat', notes: 'Nota' },
    inv: { title: 'Invois', date: 'Tarikh', kind: 'Jenis', vendor: 'Pembekal', category: 'Kategori', uploader: 'Dimuat naik oleh', status: 'Status', paidDate: 'Tarikh bayar', notes: 'Nota', amount: 'Jumlah (RM)', total: 'Jumlah keseluruhan', receipt: 'Resit', photoUnavailable: 'Foto tiada' },
    kind: { claim: 'Tuntutan staf', company: 'Invois syarikat' },
    status: { pending: 'Menunggu', reimbursed: 'Dibayar balik', rejected: 'Ditolak' },
  },
};

export function exportLabels(lang: Lang): ExportLabels {
  return LABELS[lang];
}

export interface CalendarRow { date: string; time: string; title: string; assignees: string; place: string; notes: string }
export interface InvoiceExportRow {
  id: string; date: string; kind: string; vendor: string; category: string; uploader: string;
  status: string; paidDate: string; notes: string; amountSen: number; amountText: string;
}

/** Events as table rows: by date, then start time (all-day first), then title. */
export function calendarRows(events: (EventDoc & { id?: string })[], members: Pick<MemberDoc, 'uid' | 'name'>[], lang: Lang): CalendarRow[] {
  const L = exportLabels(lang);
  const names = new Map(members.map((m) => [m.uid, m.name]));
  const key = (e: EventDoc) => (e.allDay || !e.start ? '' : e.start);
  return [...events]
    .sort((a, b) => a.date.localeCompare(b.date) || key(a).localeCompare(key(b)) || a.title.localeCompare(b.title))
    .map((e) => ({
      date: e.date,
      time: e.allDay || !e.start ? L.allDay : e.end ? `${e.start}-${e.end}` : e.start,
      title: e.title,
      assignees: e.assignees.map((u) => names.get(u)).filter((n): n is string => !!n).join(', '),
      place: e.place ?? '',
      notes: e.notes ?? '',
    }));
}

/** Invoices as table rows (oldest first, as a ledger reads) and the exact total in sen. */
export function invoiceRows(invoices: (InvoiceDoc & { id: string })[], lang: Lang): { rows: InvoiceExportRow[]; totalSen: number } {
  const L = exportLabels(lang);
  const sorted = [...invoices].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const rows = sorted.map((i) => ({
    id: i.id, date: i.date, kind: L.kind[i.kind], vendor: i.vendor, category: i.category, uploader: i.uploaderName,
    status: i.kind === 'claim' && i.status ? L.status[i.status] : '', paidDate: i.paidDate ?? '', notes: i.notes ?? '',
    amountSen: i.amountSen, amountText: formatRM(i.amountSen),
  }));
  return { rows, totalSen: rows.reduce((s, r) => s + r.amountSen, 0) };
}

/** tana-<team>-<from>_<to>.<ext>; characters unsafe in file names become "-". */
export function exportFilename(team: string, from: string, to: string, ext: 'xlsx' | 'pdf'): string {
  const slug = team.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'team';
  return `tana-${slug}-${from}_${to}.${ext}`;
}

/** Helvetica (WinAnsi) cannot draw anything beyond Latin-1; such text must be rendered as an image. */
export function needsCanvas(texts: string[]): boolean {
  return texts.some((s) => /[^\u0000-ÿ]/.test(s));
}
