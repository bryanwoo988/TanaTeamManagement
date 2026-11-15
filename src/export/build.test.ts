import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { buildCalendarXlsx, buildInvoiceXlsx } from './xlsx';
import { buildCalendarPdf, buildInvoicePdf } from './pdf';
import type { EventDoc, InvoiceDoc } from '../../shared/types';

const inv = (id: string, o: Partial<InvoiceDoc> = {}) => ({ id, kind: 'claim', amountSen: 1250, date: '2026-11-10', vendor: 'Ah Seng', category: 'Fuel', notes: '', photoPath: 'p/' + id, uploadedBy: 'u', uploaderName: 'Ann', relatedUids: [], status: 'pending', ...o }) as unknown as InvoiceDoc & { id: string };
const ev = { id: 'e', title: 'Spray', date: '2026-11-10', allDay: true, assignees: ['u1'], place: 'Plot 3', notes: '' } as unknown as EventDoc & { id: string };
const text = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsBinaryString(b); });
async function sheet(b: Blob) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await b.arrayBuffer());
  return wb.worksheets[0];
}

describe('xlsx', () => {
  it('invoice sheet has numeric RM amounts and a total row', async () => {
    const ws = await sheet(await buildInvoiceXlsx([inv('1', { amountSen: 1010 }), inv('2', { amountSen: 25 })], 'en'));
    const amountCol = ws.getRow(1).values as unknown[];
    const idx = amountCol.indexOf('Amount (RM)');
    expect(idx).toBeGreaterThan(0);
    expect(ws.getRow(2).getCell(idx).value).toBe(10.1);
    const last = ws.getRow(ws.rowCount);
    expect(last.getCell(idx).value).toBe(10.35);
    expect(String(last.getCell(1).value)).toBe('Total');
  });
  it('calendar sheet lists events with names', async () => {
    const ws = await sheet(await buildCalendarXlsx([ev], [{ uid: 'u1', name: 'Ann' }], 'zh'));
    const vals = ws.getRow(2).values as unknown[];
    expect(vals).toContain('Spray');
    expect(vals).toContain('Ann');
    expect(vals).toContain('全天');
  });
});

describe('pdf', () => {
  it('latin-only docs use real text (Helvetica) and a photo that fails to load becomes an unavailable page', async () => {
    const loadImage = vi.fn().mockRejectedValue(new Error('cors'));
    const blob = await buildInvoicePdf([inv('1')], { '1': 'https://x/1.jpg' }, 'en', { loadImage });
    expect(blob.type).toBe('application/pdf');
    const s = await text(blob);
    expect(s).toContain('(Photo unavailable)');
    expect(s).toContain('Ah Seng');
    expect(s.match(/\/Type \/Page\b/g)?.length).toBe(2);
  });
  it('a missing photo url also yields the unavailable page and the other receipts still render', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const loadImage = vi.fn().mockResolvedValue({ dataUrl: png, width: 1, height: 1 });
    const blob = await buildInvoicePdf([inv('1'), inv('2')], { '1': 'u1' }, 'ms', { loadImage });
    const s = await text(blob);
    expect(loadImage).toHaveBeenCalledTimes(1);
    expect(s.match(/\/Type \/Page\b/g)?.length).toBe(3);
    expect(s).toContain('(Foto tiada)');
  });
  it('calendar pdf builds', async () => {
    const blob = await buildCalendarPdf([ev], [{ uid: 'u1', name: 'Ann' }], 'en', '2026-11-01', '2026-11-30');
    expect(blob.size).toBeGreaterThan(500);
  });
  it('cjk text goes through the canvas painter instead of Helvetica', async () => {
    const drawn: string[] = [];
    const canvasFactory = () => ({
      width: 0, height: 0,
      getContext: () => ({ measureText: (s: string) => ({ width: s.length * 6 }), fillText: (s: string) => drawn.push(s), fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, set font(_v: string) {}, set fillStyle(_v: string) {}, set strokeStyle(_v: string) {}, set lineWidth(_v: number) {}, set textAlign(_v: string) {}, set textBaseline(_v: string) {} }),
      toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    }) as unknown as HTMLCanvasElement;
    const blob = await buildInvoicePdf([inv('1', { vendor: '阿成' })], {}, 'zh', { canvasFactory });
    expect(drawn).toContain('阿成');
    expect(blob.size).toBeGreaterThan(300);
  });
});
