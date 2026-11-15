import { calendarRows, exportLabels, invoiceRows } from '../../shared/export';
import type { EventDoc, InvoiceDoc, Lang, MemberDoc } from '../../shared/types';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function toBlob(wb: { xlsx: { writeBuffer(): Promise<ArrayBuffer | Uint8Array> } }): Promise<Blob> {
  return new Blob([(await wb.xlsx.writeBuffer()) as BlobPart], { type: XLSX });
}

/** exceljs is loaded on demand so it stays out of the initial bundle. */
async function newBook() {
  const { default: ExcelJS } = await import('exceljs');
  return new ExcelJS.Workbook();
}

export async function buildCalendarXlsx(events: (EventDoc & { id?: string })[], members: Pick<MemberDoc, 'uid' | 'name'>[], lang: Lang): Promise<Blob> {
  const L = exportLabels(lang).cal;
  const wb = await newBook();
  const ws = wb.addWorksheet(L.title);
  ws.columns = [
    { header: L.date, key: 'date', width: 12 }, { header: L.time, key: 'time', width: 14 }, { header: L.event, key: 'title', width: 28 },
    { header: L.assignees, key: 'assignees', width: 24 }, { header: L.place, key: 'place', width: 20 }, { header: L.notes, key: 'notes', width: 36 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRows(calendarRows(events, members, lang));
  return toBlob(wb);
}

export async function buildInvoiceXlsx(invoices: (InvoiceDoc & { id: string })[], lang: Lang): Promise<Blob> {
  const L = exportLabels(lang).inv;
  const wb = await newBook();
  const ws = wb.addWorksheet(L.title);
  ws.columns = [
    { header: L.date, key: 'date', width: 12 }, { header: L.kind, key: 'kind', width: 16 }, { header: L.vendor, key: 'vendor', width: 24 },
    { header: L.category, key: 'category', width: 18 }, { header: L.uploader, key: 'uploader', width: 18 }, { header: L.status, key: 'status', width: 14 },
    { header: L.paidDate, key: 'paidDate', width: 12 }, { header: L.notes, key: 'notes', width: 30 },
    { header: L.amount, key: 'amount', width: 14, style: { numFmt: '#,##0.00' } },
  ];
  ws.getRow(1).font = { bold: true };
  const { rows, totalSen } = invoiceRows(invoices, lang);
  for (const r of rows) ws.addRow({ ...r, amount: r.amountSen / 100 });
  const total = ws.addRow({ date: L.total, amount: totalSen / 100 });
  total.font = { bold: true };
  return toBlob(wb);
}
